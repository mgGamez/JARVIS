import os,shutil
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1720,'height':1080},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 base=os.environ.get('JARVIS_TEST_URL','http://127.0.0.1:3005')
 page.goto(base)
 assert page.request.get(base+'/api/status').json().get('testFixture') is True
 expect(page.locator('#hudStatus')).to_have_text('BRAIN SERVER REACHABLE')
 expect(page.locator('#hudStats')).to_contain_text('App memory')
 page.screenshot(path='/tmp/jarvis-hud-desktop.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('#hudAI').click();page.locator('#aiProvider').wait_for();page.locator('#closePanel').click()
 page.locator('#hudChat').click();expect(page.locator('#assistantView')).to_be_visible()
 page.route('**/api/chat',lambda route:route.fulfill(status=200,content_type='application/json',body='{"reply":"Controlled HUD test response."}'))
 page.locator('#prompt').fill('Hello');page.locator('#sendButton').click();expect(page.locator('#messages')).to_contain_text('Controlled HUD test response.')
 page.locator('#hudHome').click();page.once('dialog',lambda d:d.accept());page.locator('#hudStop').click();expect(page.locator('#hudStatus')).to_have_text('AUTOMATION PAUSED')
 page.reload();expect(page.locator('#hudStatus')).to_have_text('AUTOMATION PAUSED')
 page.once('dialog',lambda d:d.accept());page.locator('#hudResume').click();expect(page.locator('#hudStatus')).to_have_text('BRAIN SERVER REACHABLE')
 page.locator('#menuButton').click();page.locator('#memoryNav').click();expect(page.locator('#panel')).to_be_visible();page.locator('#closePanel').click()
 page.set_viewport_size({'width':390,'height':844});page.locator('#hudHome').click();page.screenshot(path='/tmp/jarvis-hud-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('#hudOpenChat').click();expect(page.locator('#prompt')).to_be_visible()
 assert not errors,errors
 browser.close();print('HUD browser passed: live telemetry UI, primary navigation, controlled chat response, emergency-stop persistence/resume, drawer tools and mobile layout. Physical voice and Windows hardware not verified.')
