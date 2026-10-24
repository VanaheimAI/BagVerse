#!/usr/bin/env python3
"""Import DailySounds.org downloads into public/sfx/<slot>.mp3 for src/audio.js.
   python3 tools/import_sfx.py <folder or .zip with the downloaded mp3s>
Matches files to slots by title (the download names look like Crisp_Button_Click_DailySounds.mp3), then with ffmpeg:
trims leading silence, mono, loudness-normalised, one-shots capped at 4 s (with a fade), loops capped at 40 s with a
short fade at both ends, 64 kbps (loops 80 kbps). Prints anything it could not match."""
import os, re, subprocess, sys, tempfile, zipfile

SLOTS = {   # slot: (title words, loop?)
    'click': ('crisp button click', 0), 'tap': ('soft interface tap', 0), 'open': ('game menu change', 0), 'error': ('subtle error tone', 0),
    'success': ('gentle success chime', 0), 'levelup': ('arcade power up', 0), 'tier': ('chest powerup special', 0), 'achieve': ('crystal sparkle', 0),
    'coin': ('coin fall', 0), 'gift': ('choose open gift', 0), 'ping': ('8bit radar ping', 0), 'scanok': ('scan accepted', 0), 'scandeny': ('scan denied', 0),
    'jump': ('fast whoosh', 0), 'whoosh': ('airy transition whoosh', 0), 'poof': ('magic poof', 0), 'scratch': ('record scratch single', 0), 'brake': ('bicycle brake noises', 0),
    'steps': ('footsteps on stone', 1), 'scooter': ('electric vehicle acceleration whine', 1), 'city': ('big city ambiance', 1), 'crowd': ('crowd chatter', 1), 'pad': ('calm ambient pad', 1),
}
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower().replace('dailysounds', '')).strip()

def main(src):
    tmp = None
    if src.endswith('.zip'):
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(src).extractall(tmp); src = tmp
    files = [os.path.join(r, f) for r, _, fs in os.walk(src) for f in fs if f.lower().endswith(('.mp3', '.wav', '.ogg'))]
    out = os.path.join(os.path.dirname(__file__), '..', 'public', 'sfx'); os.makedirs(out, exist_ok=True)
    used = set()
    for slot, (title, loop) in SLOTS.items():
        words = norm(title).split()
        hit = next((f for f in files if f not in used and all(w in norm(os.path.basename(f)).replace('8 bit', '8bit') .split() or w in norm(os.path.basename(f)) for w in words)), None)
        if not hit: print('MISSING', slot, '<-', title); continue
        used.add(hit)
        cap, rate = (40, '80k') if loop else (4, '64k')
        af = f"silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I={-20 if loop else -16}:TP=-1.5:LRA=11,atrim=0:{cap},afade=t=in:d={0.4 if loop else 0.005},areverse,afade=t=in:d={0.6 if loop else 0.08},areverse"
        dst = os.path.join(out, slot + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', hit, '-ac', '1', '-ar', '44100', '-af', af, '-b:a', rate, dst], check=True)
        print(f'{slot:9s} <- {os.path.basename(hit)}  ({os.path.getsize(dst) // 1024} KB)')
    for f in files:
        if f not in used: print('UNUSED', os.path.basename(f))

if __name__ == '__main__':
    main(sys.argv[1])
