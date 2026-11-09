#!/usr/bin/env python3
"""Builds dist/workshop-spam-filter-<version>.zip containing only the extension files."""
import json, os, zipfile

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(root)
version = json.load(open('manifest.json'))['version']
files = ['manifest.json', 'content.js', 'content.css', 'scoring.js', 'blocklist.js',
         'options.html', 'options.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png']
os.makedirs('dist', exist_ok=True)
out = f'dist/workshop-spam-filter-{version}.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f)
print('built', out)
