#!/usr/bin/env python3
"""Ravenhollow updater and Steam helper (SteamOS / Linux, Python standard library only).

  rh_update.py --install           download every game file (installer, progress in the terminal)
  rh_update.py --launch            quick update check before the game starts (progress window if needed)
  rh_update.py --steam-art [--wait N]  put the library artwork on the Ravenhollow shortcut in Steam
  rh_update.py --has-shortcut      exit 0 when Steam already has a Ravenhollow shortcut

The game lives next to this script. repo.txt names the public GitHub repository whose main branch holds
manifest.json: every game file with its sha256, size and download url. Only changed files are fetched;
they are checked, staged and then moved into place, so a broken download never breaks the installed game.
Exit code 3 from --launch means the launcher itself was replaced and should be started again.
"""
import hashlib, json, os, shutil, struct, subprocess, sys, time, urllib.request, zlib
from concurrent.futures import ThreadPoolExecutor

DIR = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(DIR, '.manifest.json')
STAGE = os.path.join(DIR, '.staging')
UA = {'User-Agent': 'Ravenhollow-updater/1'}


def base_url():
    if os.environ.get('RH_BASE'): return os.environ['RH_BASE'].rstrip('/')
    try: repo = open(os.path.join(DIR, 'repo.txt')).read().strip()
    except OSError: return None
    return f'https://raw.githubusercontent.com/{repo}/main' if repo else None


def fetch(url, timeout):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: return r.read()


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()


class Progress:
    """zenity progress window (game mode / desktop) or plain terminal lines"""
    def __init__(self, gui, title):
        self.p = None; self.last = -1
        if gui and shutil.which('zenity') and (os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')):
            try:
                self.p = subprocess.Popen(['zenity', '--progress', '--title=Ravenhollow', f'--text={title}', '--percentage=0',
                                           '--auto-close', '--no-cancel', '--width=420'], stdin=subprocess.PIPE, text=True)
            except OSError: self.p = None
        if not self.p: print(title, flush=True)

    def set(self, frac, text=None):
        pct = max(0, min(100, int(frac * 100)))
        if self.p:
            try:
                if text: self.p.stdin.write(f'# {text}\n')
                self.p.stdin.write(f'{min(pct, 99)}\n'); self.p.stdin.flush()
            except (BrokenPipeError, OSError): self.p = None
        elif pct // 5 != self.last // 5 or text:
            print(f'  {pct:3d}%  {text or ""}', flush=True)
        self.last = pct

    def close(self):
        if self.p:
            try: self.p.stdin.write('100\n'); self.p.stdin.close(); self.p.wait(5)
            except Exception: pass


def update(gui, install):
    base = base_url()
    if not base: print('no repo.txt: skipping the update check'); return 0
    try: man = json.loads(fetch(base + '/manifest.json', 25 if install else 4))
    except Exception as e:
        print('update check skipped (offline?):', e)
        return 1 if install else 0
    try: old = json.load(open(STATE))
    except Exception: old = {'files': {}}
    files = man['files']; todo = []
    for path, info in files.items():
        dst = os.path.join(DIR, path)
        known = old['files'].get(path, {}).get('sha256')
        if known == info['sha256'] and os.path.isfile(dst) and os.path.getsize(dst) == info['size']: continue
        if known is None and os.path.isfile(dst) and os.path.getsize(dst) == info['size'] and sha256(dst) == info['sha256']: continue
        todo.append((path, info))
    gone = [p for p in old['files'] if p not in files]
    if not todo and not gone:
        if man.get('version') != old.get('version'): json.dump(man, open(STATE, 'w'))
        print('Ravenhollow is up to date (%s)' % man.get('version')); return 0
    total = sum(i['size'] for _, i in todo) or 1
    big = total > 3e6 or install
    prog = Progress(gui and big, ('Installing' if install or not old['files'] else 'Updating') +
                    f' Ravenhollow {man.get("version", "")} ({total / 2**20:.0f} MB)')
    shutil.rmtree(STAGE, ignore_errors=True); os.makedirs(STAGE)
    done = [0]; errors = []

    def get(item):
        path, info = item; out = os.path.join(STAGE, path); os.makedirs(os.path.dirname(out), exist_ok=True)
        for attempt in range(4):
            try:
                h = hashlib.sha256(); n = 0
                with urllib.request.urlopen(urllib.request.Request(info['url'], headers=UA), timeout=60) as r, open(out, 'wb') as f:
                    while True:
                        b = r.read(1 << 18)
                        if not b: break
                        f.write(b); h.update(b); n += len(b); done[0] += len(b)
                if h.hexdigest() == info['sha256'] and n == info['size']: return
                done[0] -= n; raise IOError('checksum mismatch')
            except Exception as e:
                if attempt == 3: errors.append(f'{path}: {e}')
                else: time.sleep(1.5 * (attempt + 1))

    with ThreadPoolExecutor(6) as ex:
        futs = [ex.submit(get, it) for it in sorted(todo, key=lambda t: -t[1]['size'])]
        while any(not f.done() for f in futs):
            prog.set(done[0] / total, f'{done[0] / 2**20:.0f} of {total / 2**20:.0f} MB'); time.sleep(0.25)
    if errors:
        prog.close(); shutil.rmtree(STAGE, ignore_errors=True)
        print('download failed, the installed game is unchanged:\n  ' + '\n  '.join(errors[:5]))
        return 1
    relaunch = False
    for path, info in todo:
        dst = os.path.join(DIR, path); os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(os.path.join(STAGE, path), dst)          # rename: a running launcher keeps its old copy open
        if path.endswith('.sh'): os.chmod(dst, 0o755)
        if path == 'ravenhollow.sh': relaunch = True
    for path in gone:
        if path.split('/')[0] in ('src', 'assets', 'art'):
            try: os.remove(os.path.join(DIR, path))
            except OSError: pass
    shutil.rmtree(STAGE, ignore_errors=True)
    json.dump(man, open(STATE, 'w'))
    prog.set(1, 'Done'); prog.close()
    print(f'Ravenhollow {man.get("version")} installed ({len(todo)} files)')
    return 3 if relaunch and not install else 0


# ---------- Steam: binary shortcuts.vdf ----------
def steam_roots():
    h = os.path.expanduser('~')
    for r in ('.local/share/Steam', '.steam/steam', '.steam/root', '.var/app/com.valvesoftware.Steam/data/Steam'):
        p = os.path.realpath(os.path.join(h, r))
        if os.path.isdir(os.path.join(p, 'userdata')): yield p


def read_vdf(buf):
    pos = 0
    def cstr():
        nonlocal pos
        e = buf.index(b'\0', pos); s = buf[pos:e].decode('utf-8', 'replace'); pos = e + 1; return s
    def obj():
        nonlocal pos
        d = {}
        while pos < len(buf):
            t = buf[pos]; pos += 1
            if t == 8: return d
            k = cstr()
            if t == 0: d[k] = obj()
            elif t == 1: d[k] = cstr()
            elif t == 2: d[k] = struct.unpack_from('<i', buf, pos)[0]; pos += 4
            elif t == 7: d[k] = struct.unpack_from('<Q', buf, pos)[0]; pos += 8
            else: raise ValueError('unknown vdf type %d' % t)
        return d
    return obj()


def our_shortcuts():
    """[(userdata config dir, appid)] for every Steam shortcut that starts Ravenhollow"""
    found = []
    for root in set(steam_roots()):
        for uid in os.listdir(os.path.join(root, 'userdata')):
            cfg = os.path.join(root, 'userdata', uid, 'config'); f = os.path.join(cfg, 'shortcuts.vdf')
            if not os.path.isfile(f): continue
            try: data = read_vdf(open(f, 'rb').read())
            except Exception: continue
            for sc in data.get('shortcuts', {}).values():
                if not isinstance(sc, dict): continue
                k = {key.lower(): v for key, v in sc.items()}
                exe = str(k.get('exe', '')); name = str(k.get('appname', ''))
                if 'ravenhollow' not in (exe + ' ' + name).lower(): continue
                aid = k.get('appid')
                aid = (aid & 0xffffffff) if isinstance(aid, int) and aid else (zlib.crc32((exe + name).encode()) | 0x80000000)
                found.append((cfg, aid))
    return found


def steam_art(wait):
    art = os.path.join(DIR, 'art')
    if not os.path.isdir(art): print('no art folder'); return 1
    t0 = time.time()
    while True:
        sc = our_shortcuts()
        if sc or time.time() - t0 >= wait: break
        time.sleep(1)
    if not sc: print('Steam has no Ravenhollow shortcut yet'); return 1
    for cfg, aid in sc:
        grid = os.path.join(cfg, 'grid'); os.makedirs(grid, exist_ok=True)
        for src, dst in (('capsule.png', f'{aid}p.png'), ('wide.png', f'{aid}.png'), ('hero.png', f'{aid}_hero.png'),
                         ('logo.png', f'{aid}_logo.png'), ('icon.png', f'{aid}_icon.png')):
            if os.path.isfile(os.path.join(art, src)): shutil.copyfile(os.path.join(art, src), os.path.join(grid, dst))
        print('artwork set for shortcut', aid, 'in', grid)
    open(os.path.join(DIR, '.steam_art_done'), 'w').write(' '.join(str(a) for _, a in sc))
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--install' in a: sys.exit(update(gui=False, install=True))
    if '--launch' in a: sys.exit(update(gui=True, install=False))
    if '--steam-art' in a:
        w = float(a[a.index('--wait') + 1]) if '--wait' in a else 0
        sys.exit(steam_art(w))
    if '--has-shortcut' in a: sys.exit(0 if our_shortcuts() else 1)
    print(__doc__)
