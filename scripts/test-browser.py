"""Optional Chromium regression runner. Each suite gets fresh temporary brain data.
Requires Python Playwright and an installed Chromium executable on PATH.
No personal accounts, real mail or real device operations are used.
"""
import os,socket,subprocess,time,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
for suite in ['test/browser.py','test/core-browser.py','test/workflows-browser.py','test/hud-browser.py']:
 with socket.socket() as probe:
  probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
 env={**os.environ,'JARVIS_TEST_FIXTURE':'true','PORT':str(port),'JARVIS_TEST_URL':f'http://127.0.0.1:{port}'}
 server=subprocess.Popen(['node','scripts/browser-fixture.js'],cwd=root,env=env,stdout=subprocess.DEVNULL)
 try:
  for attempt in range(50):
   if server.poll() is not None: raise RuntimeError('Fixture exited before startup')
   try:
    with urllib.request.urlopen(env['JARVIS_TEST_URL']+'/api/status',timeout=1) as response:
     assert b'"testFixture":true' in response.read()
    break
   except Exception: time.sleep(.1)
  else: raise RuntimeError('Fixture failed to start')
  subprocess.run(['python3',suite],cwd=root,env=env,check=True)
 finally:
  server.terminate();server.wait(timeout=5)
