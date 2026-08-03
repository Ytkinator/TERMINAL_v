#!/usr/bin/env python3
"""HTTP server with no-cache headers + /print endpoint for silent thermal printing."""
import http.server
import json
import base64
import io
import sys
import os
import urllib.parse
import urllib.request
import hashlib
import re
import time

# --- Load .env file ---
def load_env(path='.env'):
    """Load key=value pairs from .env file into os.environ."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    if not os.path.exists(env_path):
        print(f"[ENV] Warning: {env_path} not found, using environment variables")
        return
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, value = line.partition('=')
            os.environ.setdefault(key.strip(), value.strip())
    print(f"[ENV] Loaded from {env_path}")

load_env()

TERMINAL_NAME = os.environ.get('TERMINAL_NAME', 'term1')
TERMINAL_CODE = os.environ.get('TERMINAL_CODE', '')
TERMINAL_ID = os.environ.get('TERMINAL_ID', '1')
BACKEND_API_BASE_URL = os.environ.get('BACKEND_API_BASE_URL', 'https://vgsport-admin.eskimos.ski').rstrip('/')
CACHE_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache', 'assets')

print(f"[ENV] TERMINAL_NAME={TERMINAL_NAME}")
print(f"[ENV] TERMINAL_CODE={'*' * len(TERMINAL_CODE) if TERMINAL_CODE else 'EMPTY!'}")
print(f"[ENV] TERMINAL_ID={TERMINAL_ID}")
print(f"[ENV] BACKEND_API_BASE_URL={BACKEND_API_BASE_URL}")
if not TERMINAL_CODE:
    print("[ENV] WARNING: TERMINAL_CODE is empty! Set it in .env file")

def backend_api_url(path):
    """Build backend API URL from BACKEND_API_BASE_URL."""
    return BACKEND_API_BASE_URL + path

def rewrite_backend_asset_url(value):
    """Rewrite backend-generated local asset URLs so remote terminals can load them."""
    if not isinstance(value, str):
        return value

    if value.startswith('/storage/'):
        return BACKEND_API_BASE_URL + value

    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in ('http', 'https'):
        return value

    if parsed.hostname not in ('localhost', '127.0.0.1', '0.0.0.0'):
        return value

    if not parsed.path.startswith('/storage/'):
        return value

    rewritten = BACKEND_API_BASE_URL + parsed.path
    if parsed.query:
        rewritten += '?' + parsed.query

    return rewritten

def cached_asset_path_for_url(url):
    """Build stable local cache path for a remote asset URL."""
    parsed = urllib.parse.urlparse(url)
    _, ext = os.path.splitext(parsed.path)
    if not ext or len(ext) > 8:
        ext = '.bin'

    filename = hashlib.sha256(url.encode('utf-8')).hexdigest()[:24] + ext.lower()
    return os.path.join(CACHE_ASSETS_DIR, filename), '/cache/assets/' + filename

def cache_backend_asset_url(value):
    """Download backend asset once and return a local URL for the browser."""
    source_url = rewrite_backend_asset_url(value)

    if not isinstance(source_url, str):
        return source_url

    if source_url.startswith('/cache/assets/'):
        return source_url

    parsed = urllib.parse.urlparse(source_url)
    if parsed.scheme not in ('http', 'https') or not parsed.path.startswith('/storage/'):
        return source_url

    local_path, local_url = cached_asset_path_for_url(source_url)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return local_url

    try:
        os.makedirs(CACHE_ASSETS_DIR, exist_ok=True)
        req = urllib.request.Request(source_url, headers={'User-Agent': 'TerminalVG/1.0'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()

        tmp_path = local_path + '.tmp'
        with open(tmp_path, 'wb') as f:
            f.write(data)
        os.replace(tmp_path, local_path)
        print(f"[ASSET CACHE] Saved {source_url} -> {local_url} ({len(data)} bytes)")
        return local_url
    except Exception as e:
        print(f"[ASSET CACHE] Failed {source_url}: {e}")
        return source_url

def cache_backend_asset_urls(value):
    """Recursively cache backend asset URLs in JSON-compatible payloads."""
    if isinstance(value, dict):
        return {key: cache_backend_asset_urls(item) for key, item in value.items()}

    if isinstance(value, list):
        return [cache_backend_asset_urls(item) for item in value]

    return cache_backend_asset_url(value)

# --- Printer setup (Windows GDI, like PhotoBudka) ---

PRINTER = None
PRINTER_NAME = None
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRINTS_DIR = os.path.join(BASE_DIR, 'prints')

def init_printer():
    """Detect default printer on Windows."""
    global PRINTER_NAME
    if sys.platform != "win32":
        print("[PRINTER] Not Windows — print endpoint will simulate only")
        return
    try:
        import win32print
        PRINTER_NAME = win32print.GetDefaultPrinter()
        print(f"[PRINTER] GDI mode, using '{PRINTER_NAME}'")
    except ImportError:
        print("[PRINTER] win32print not available. Install: pip install pywin32")
    except Exception as e:
        print(f"[PRINTER] Error detecting printer: {e}")


def print_image_gdi(img_bytes):
    """Print image bytes via Windows GDI — no browser dialog."""
    global PRINTER_NAME
    try:
        import win32print
        import win32ui
        from PIL import Image, ImageWin

        if not PRINTER_NAME:
            PRINTER_NAME = win32print.GetDefaultPrinter()

        img = Image.open(io.BytesIO(img_bytes))

        # Convert to RGB if needed
        if img.mode != "RGB":
            img = img.convert("RGB")

        hdc = win32ui.CreateDC()
        hdc.CreatePrinterDC(PRINTER_NAME)
        hdc.StartDoc("TerminalVG_Ticket")
        hdc.StartPage()

        # Get printer page size in pixels
        page_w = hdc.GetDeviceCaps(110)  # PHYSICALWIDTH
        page_h = hdc.GetDeviceCaps(111)  # PHYSICALHEIGHT

        # Scale image to fit page width
        w, h = img.size
        ratio = min(page_w / w, page_h / h)
        new_w = int(w * ratio)
        new_h = int(h * ratio)

        # Center horizontally
        x = (page_w - new_w) // 2
        y = 0

        dib = ImageWin.Dib(img)
        dib.draw(hdc.GetHandleOutput(), (x, y, x + new_w, y + new_h))

        hdc.EndPage()
        hdc.EndDoc()
        hdc.DeleteDC()

        return True, "Printed via GDI"
    except ImportError as e:
        return False, f"Missing library: {e}. Run: pip install pywin32 Pillow"
    except Exception as e:
        return False, f"GDI print error: {e}"


def render_pdf_first_page_to_png(pdf_bytes):
    """Render the first PDF page to PNG bytes for Windows GDI printing."""
    try:
        import fitz

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if doc.page_count < 1:
            return None, "PDF has no pages"

        page = doc.load_page(0)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        return pixmap.tobytes("png"), "PDF rendered"
    except ImportError as e:
        return None, f"Missing library: {e}. Run: pip install PyMuPDF"
    except Exception as e:
        return None, f"PDF render error: {e}"


def safe_print_filename(name):
    """Return a filesystem-safe PDF filename."""
    if not name:
        name = f"ticket-{int(time.time())}.pdf"
    name = os.path.basename(str(name))
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    if not name:
        name = f"ticket-{int(time.time())}.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def save_print_pdf(pdf_bytes, filename):
    """Save print PDF for diagnostics and audit."""
    os.makedirs(PRINTS_DIR, exist_ok=True)
    target = os.path.join(PRINTS_DIR, safe_print_filename(filename))
    if os.path.exists(target):
        base, ext = os.path.splitext(target)
        target = f"{base}-{int(time.time())}{ext}"
    with open(target, "wb") as f:
        f.write(pdf_bytes)
    return target


# --- HTTP Server ---

class TerminalHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS headers for Vercel origin (if frontend loaded from there)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # No-cache
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/print':
            self._handle_print()
        elif self.path == '/api/categories':
            self._handle_api_proxy()
        elif self.path == '/api/tickets/create':
            self._handle_tickets_proxy()
        elif self.path == '/api/tickets/email':
            self._handle_email_proxy()
        elif self.path == '/api/rental/orders':
            self._handle_rental_create_proxy()
        elif self.path == '/api/rental/orders/lookup':
            self._handle_rental_lookup_proxy()
        elif self.path.startswith('/api/rental/orders/') and self.path.endswith('/pay'):
            self._handle_rental_pay_proxy()
        elif self.path == '/api/groups/catalog':
            self._handle_group_catalog_proxy()
        elif self.path == '/api/groups/pay':
            self._handle_group_pay_proxy()
        elif self.path == '/api/instructors/catalog':
            self._handle_instructor_catalog_proxy()
        elif self.path == '/api/instructors/pay':
            self._handle_instructor_pay_proxy()
        elif self.path == '/api/visits/catalog':
            self._handle_visit_catalog_proxy()
        elif self.path == '/api/visits/availability':
            self._handle_visit_availability_proxy()
        elif self.path == '/api/visits/holds':
            self._handle_visit_hold_proxy()
        elif self.path.startswith('/api/visits/holds/') and self.path.endswith('/cancel'):
            self._handle_visit_cancel_proxy()
        elif self.path.startswith('/api/visits/holds/') and self.path.endswith('/pay'):
            self._handle_visit_pay_proxy()
        else:
            self.send_error(404)

    def _handle_print(self):
        """Receive base64 PDF → save it and print via Windows GDI."""
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            pdf_data = data.get('pdf', '')
            if not pdf_data:
                raise ValueError("Missing pdf payload")
            # Strip data URL prefix if present
            if ',' in pdf_data:
                pdf_data = pdf_data.split(',', 1)[1]

            pdf_bytes = base64.b64decode(pdf_data)
            pdf_path = save_print_pdf(pdf_bytes, data.get('filename'))

            if sys.platform == "win32" and PRINTER_NAME:
                img_bytes, render_message = render_pdf_first_page_to_png(pdf_bytes)
                if not img_bytes:
                    raise RuntimeError(render_message)
                success, message = print_image_gdi(img_bytes)
                message = f"{message}; saved PDF: {os.path.basename(pdf_path)}"
            else:
                # Simulate on non-Windows
                success = True
                message = "Print simulated (not Windows)"
                print(f"[PRINT SIMULATED] Received PDF {len(pdf_bytes)} bytes -> {pdf_path}")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': success,
                'message': message,
                'format': 'pdf',
                'file': os.path.basename(pdf_path)
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'message': str(e)
            }).encode())

    def _handle_api_proxy(self):
        """Proxy POST to external ticket API — injects credentials from .env."""
        import urllib.request
        try:
            # Ignore frontend body — build request with server-side credentials
            length = int(self.headers.get('Content-Length', 0))
            if length > 0:
                self.rfile.read(length)  # drain

            payload = json.dumps({
                'terminal_name': TERMINAL_NAME,
                'terminal_code': TERMINAL_CODE
            }).encode()

            api_url = backend_api_url('/api/v1/tickets/terminal/categories')
            req = urllib.request.Request(
                api_url,
                data=payload,
                headers={
                    'Content-Type': 'application/json',
                    'Cookie': f'terminal_id={TERMINAL_ID}'
                },
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_body = resp.read()

            try:
                resp_data = json.loads(resp_body.decode('utf-8'))
                resp_body = json.dumps(cache_backend_asset_urls(resp_data), ensure_ascii=False).encode('utf-8')
            except Exception as e:
                print(f"[API PROXY] Asset cache skipped: {e}")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"[API PROXY] OK, {len(resp_body)} bytes")

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': True,
                'message': str(e)
            }).encode())
            print(f"[API PROXY] Error: {e}")

    def _handle_tickets_proxy(self):
        """Proxy POST to Eskimos ticket creation API — injects terminal_code from .env."""
        import urllib.request
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body) if body else {}

            # Inject server-side credentials (overwrite anything from frontend)
            data['terminal_code'] = TERMINAL_CODE
            if 'transaction' in data:
                data['transaction']['terminal_id'] = TERMINAL_ID

            payload = json.dumps(data).encode()

            api_url = backend_api_url('/api/v1/tickets/terminal/create')
            req = urllib.request.Request(
                api_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_body = resp.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"[TICKETS] Created OK, {len(resp_body)} bytes")

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': True,
                'message': str(e)
            }).encode())
            print(f"[TICKETS] Error: {e}")

    def _handle_email_proxy(self):
        """Proxy POST to Eskimos email receipt API — injects terminal_code from .env."""
        import urllib.request
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body) if body else {}

            data['terminal_code'] = TERMINAL_CODE

            payload = json.dumps(data).encode()

            api_url = backend_api_url('/api/v1/tickets/terminal/email')
            req = urllib.request.Request(
                api_url,
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_body = resp.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"[EMAIL] Sent OK, {len(resp_body)} bytes")

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': True,
                'message': str(e)
            }).encode())
            print(f"[EMAIL] Error: {e}")

    def _handle_rental_create_proxy(self):
        """Proxy terminal rental order creation — injects terminal_code from .env."""
        self._proxy_rental_request('/api/v1/rent/terminal/orders', log_prefix='RENT CREATE')

    def _handle_rental_lookup_proxy(self):
        """Proxy terminal rental order lookup — injects terminal_code from .env."""
        self._proxy_rental_request('/api/v1/rent/terminal/orders/lookup', log_prefix='RENT LOOKUP')

    def _handle_rental_pay_proxy(self):
        """Proxy terminal rental order payment confirmation — injects terminal_code from .env."""
        prefix = '/api/rental/orders/'
        suffix = '/pay'
        order_key = self.path[len(prefix):-len(suffix)]
        self._proxy_rental_request('/api/v1/rent/terminal/orders/' + order_key + '/pay', log_prefix='RENT PAY')

    def _proxy_rental_request(self, backend_path, drain_body=False, log_prefix='RENT'):
        import urllib.error
        import urllib.request

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length > 0 else b''
            data = {} if drain_body else (json.loads(body) if body else {})
            data['terminal_code'] = TERMINAL_CODE

            payload = json.dumps(data).encode()

            req = urllib.request.Request(
                backend_api_url(backend_path),
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    status = resp.status
                    resp_body = resp.read()
            except urllib.error.HTTPError as e:
                status = e.code
                resp_body = e.read()

            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"[{log_prefix}] Backend {status}, {len(resp_body)} bytes")

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': True,
                'message': str(e)
            }).encode())
            print(f"[{log_prefix}] Error: {e}")

    def _handle_group_catalog_proxy(self):
        """Proxy terminal group catalog — injects terminal_code from .env."""
        self._proxy_group_request('/api/v1/groups/terminal/catalog', drain_body=True, log_prefix='GROUP CATALOG')

    def _handle_group_pay_proxy(self):
        """Proxy terminal group booking/payment — injects terminal_code from .env."""
        self._proxy_group_request('/api/v1/groups/terminal/pay', log_prefix='GROUP PAY')

    def _handle_instructor_catalog_proxy(self):
        """Proxy terminal individual instructor catalog — injects terminal_code from .env."""
        self._proxy_instructor_request('/api/v1/instructors/terminal/catalog', log_prefix='INSTRUCTOR CATALOG')

    def _handle_instructor_pay_proxy(self):
        """Proxy terminal individual instructor booking/payment — injects terminal_code from .env."""
        self._proxy_instructor_request('/api/v1/instructors/terminal/pay', log_prefix='INSTRUCTOR PAY')

    def _handle_visit_catalog_proxy(self):
        """Proxy terminal visit catalog — injects terminal_code from .env."""
        self._proxy_visit_request('/api/v1/visits/terminal/catalog', drain_body=True, log_prefix='VISIT CATALOG')

    def _handle_visit_availability_proxy(self):
        """Proxy terminal visit availability — injects terminal_code from .env."""
        self._proxy_visit_request('/api/v1/visits/terminal/availability', log_prefix='VISIT AVAILABILITY')

    def _handle_visit_hold_proxy(self):
        """Proxy terminal visit hold creation — injects terminal_code from .env."""
        self._proxy_visit_request('/api/v1/visits/terminal/holds', log_prefix='VISIT HOLD')

    def _handle_visit_cancel_proxy(self):
        """Proxy terminal visit hold cancel — injects terminal_code from .env."""
        prefix = '/api/visits/holds/'
        suffix = '/cancel'
        key = urllib.parse.quote(self.path[len(prefix):-len(suffix)], safe='')
        self._proxy_visit_request('/api/v1/visits/terminal/holds/' + key + '/cancel', drain_body=True, log_prefix='VISIT CANCEL')

    def _handle_visit_pay_proxy(self):
        """Proxy terminal visit hold payment — injects terminal_code from .env."""
        prefix = '/api/visits/holds/'
        suffix = '/pay'
        key = urllib.parse.quote(self.path[len(prefix):-len(suffix)], safe='')
        self._proxy_visit_request('/api/v1/visits/terminal/holds/' + key + '/pay', log_prefix='VISIT PAY')

    def _proxy_visit_request(self, backend_path, drain_body=False, log_prefix='VISIT'):
        self._proxy_group_request(backend_path, drain_body=drain_body, log_prefix=log_prefix)

    def _proxy_instructor_request(self, backend_path, log_prefix='INSTRUCTOR'):
        self._proxy_group_request(backend_path, drain_body=False, log_prefix=log_prefix)

    def _proxy_group_request(self, backend_path, drain_body=False, log_prefix='GROUP'):
        import urllib.error
        import urllib.request

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length > 0 else b''
            data = {} if drain_body else (json.loads(body) if body else {})
            data['terminal_code'] = TERMINAL_CODE

            payload = json.dumps(data).encode()

            req = urllib.request.Request(
                backend_api_url(backend_path),
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    status = resp.status
                    resp_body = resp.read()
            except urllib.error.HTTPError as e:
                status = e.code
                resp_body = e.read()

            try:
                resp_data = json.loads(resp_body.decode('utf-8'))
                resp_body = json.dumps(cache_backend_asset_urls(resp_data), ensure_ascii=False).encode('utf-8')
            except Exception as e:
                print(f"[{log_prefix}] Asset cache skipped: {e}")

            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(resp_body)
            print(f"[{log_prefix}] Backend {status}, {len(resp_body)} bytes")

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': True,
                'message': str(e)
            }).encode())
            print(f"[{log_prefix}] Error: {e}")

    def do_GET(self):
        if self.path == '/printer-status':
            self._handle_status()
            return
        # Clear conditional headers
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        super().do_GET()

    def _handle_status(self):
        """Check if printer is available."""
        status = {
            'available': PRINTER_NAME is not None,
            'name': PRINTER_NAME,
            'method': 'gdi' if PRINTER_NAME else None
        }
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(status).encode())


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 9999))
    print_only = '--print-only' in sys.argv

    init_printer()

    if print_only:
        # Only handle /print and /printer-status, no static files
        print(f'Print server on 0.0.0.0:{port} (print-only mode)')
    else:
        print(f'Serving on 0.0.0.0:{port} (static files + print endpoint)')

    server = http.server.HTTPServer(('0.0.0.0', port), TerminalHandler)
    server.serve_forever()
