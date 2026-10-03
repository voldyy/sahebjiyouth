"""Publish registration JavaScript, then switch index.html after assets exist.

The browser contact database is intentionally published with this deployment. The previous index is backed up
in the Git-ignored .private directory for rollback.
"""
import hashlib
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def az(*args):
    subprocess.run(['az', 'storage', 'blob', *args, '--account-name', 'sahebjiyouth',
                    '--container-name', '$web', '--auth-mode', 'login', '--only-show-errors',
                    '--output', 'none'], check=True)


def main():
    source = ROOT / 'reg'
    staging = ROOT / '.private' / 'site-deploy'
    staging.mkdir(parents=True, exist_ok=True)
    html = (source / 'index.html').read_text()
    backup = staging / ('index-before-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.html')
    az('download', '--name', 'reg/index.html', '--file', str(backup))
    for name in ['contacts-db.js', 'data.js', 'app.js', 'styles.css']:
        data = (source / name).read_bytes()
        hashed_name = f'{Path(name).stem}-{hashlib.sha256(data).hexdigest()[:16]}{Path(name).suffix}'
        target = staging / hashed_name
        target.write_bytes(data)
        az('upload', '--name', 'reg/' + hashed_name, '--file', str(target), '--overwrite', 'true',
           '--content-type', 'text/css' if name.endswith('.css') else 'application/javascript', '--content-cache-control', 'no-store' if name == 'contacts-db.js' else 'public,max-age=31536000,immutable')
        html = html.replace(f'./{name}', './' + hashed_name)
    target = staging / 'index.html'
    target.write_text(html)
    az('upload', '--name', 'reg/index.html', '--file', str(target), '--overwrite', 'true',
       '--content-type', 'text/html; charset=utf-8', '--content-cache-control', 'no-cache,max-age=0')
    print('Published registration page. Previous index saved at', backup)


if __name__ == '__main__':
    main()
