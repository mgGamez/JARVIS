import os,subprocess,urllib.request,socket,time,tempfile,threading
from http.server import HTTPServer,BaseHTTPRequestHandler
from pathlib import Path

def free_port():
 with socket.socket() as s:
  s.bind(('127.0.0.1',0));return s.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='jarvis-launch-test-') as data:
 port=free_port();url=f'http://127.0.0.1:{port}'
 env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','JARVIS_DATA_DIR':data,'JARVIS_PASSWORD':''}
 p=subprocess.Popen(['node','scripts/launch.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  for i in range(50):
   try:
    with urllib.request.urlopen(url,timeout=1) as r: assert b'reactorCanvas' in r.read()
    break
   except Exception: time.sleep(.1)
  else: raise RuntimeError('Launcher failed to start')
  duplicate=subprocess.run(['node','scripts/launch.js'],env=env,capture_output=True,text=True,timeout=10)
  assert duplicate.returncode==0,(duplicate.stdout,duplicate.stderr)
  assert 'already running' in duplicate.stdout,duplicate.stdout
 finally:
  p.terminate();p.wait(timeout=5)
 class Other(BaseHTTPRequestHandler):
  def do_GET(self):
   self.send_response(200);self.end_headers();self.wfile.write(b'Other app')
  def log_message(self,*a): pass
 server=HTTPServer(('127.0.0.1',port),Other);threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  collision=subprocess.run(['node','scripts/launch.js'],env=env,capture_output=True,text=True,timeout=10)
  assert collision.returncode==1,(collision.stdout,collision.stderr)
  assert 'used by another process' in collision.stderr,collision.stderr
  with urllib.request.urlopen(url) as r: assert r.read()==b'Other app'
 finally: server.shutdown();server.server_close()
print('Launcher Linux integration passed: serves HUD, reuses existing server, reports collision without stopping another app. Windows shell behavior remains untested.')
