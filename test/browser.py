"""Browser smoke: start JARVIS on the selected port; external AI is intercepted.
Requires Python playwright and Chromium. Local reminder actions hit the real server.
"""
import os
import shutil
import json
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright, expect
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZcoAAAAASUVORK5CYII='
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    def unavailable_account_state(route):
        response=route.fetch();data=response.json();data['desktop']=False;data['mail']={'configured':False,'connected':False,'redirectUri':'http://localhost:3000/api/mail/callback'}
        route.fulfill(response=response,json=data)
    page.route('**/api/status',unavailable_account_state)
    page.route('**/api/mail/connect',lambda route:route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'})))
    page.goto(os.environ.get('JARVIS_TEST_URL','http://127.0.0.1:3000'))
    page.locator('#chatMode').wait_for()
    page.screenshot(path='/tmp/jarvis-v2-desktop.png',full_page=True)
    # Explicit provider failure: no invented assistant turn.
    page.route('**/api/chat',lambda route:route.fulfill(status=429,content_type='application/json',body=json.dumps({'error':'Test-only quota error'})))
    page.locator('#prompt').fill('Failure test');page.locator('#sendButton').click()
    page.get_by_text('Request failed',exact=True).wait_for()
    assert 'quota error' in page.locator('#notice').inner_text()
    assert page.locator('.message.assistant').count()==0
    page.unroute('**/api/chat')
    # Explicit memory approval and persistence.
    page.locator('#memoryNav').click();page.locator('#memoryInput').fill('I prefer concise answers.')
    page.get_by_text('Approve & save memory',exact=True).click();assert page.locator('.memory-row').count()==1
    page.locator('#closePanel').click();page.reload();assert page.locator('#memoryCount').inner_text()=='1'
    page.locator('.history-link').first.click();assert page.locator('.message.user').count()==1
    calls=[]
    def reply(route):
        calls.append(route.request.post_data_json)
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'reply':'Test-only response <script>alert(1)</script>','mode':'search','grounded':True,'sources':[{'title':'Test source','url':'https://example.com/review'},{'title':'Unsafe source','url':'javascript:alert(1)'}],'searchAttribution':'<div>Test Google attribution</div>'}))
    page.route('**/api/chat',reply)
    page.locator('#prompt').fill('/search Browser test message');page.locator('#sendButton').click();page.locator('.message.assistant').wait_for()
    assert calls[0]['mode']=='search'
    assert calls[0]['memory']==['I prefer concise answers.']
    assert calls[0]['messages']==[{'role':'user','content':'Browser test message'}]
    assert '<script>alert(1)</script>' in page.locator('.message.assistant .message-body').inner_text()
    assert page.locator('#messages script').count()==0
    assert page.locator('.source-link').count()==1
    assert page.locator('.search-attribution').get_attribute('sandbox')=='allow-popups allow-popups-to-escape-sandbox'
    page.reload();page.locator('.history-link').first.click();assert page.locator('.message.assistant').count()==1
    # Actual local reminder approval, persistence, calendar download, deletion.
    page.locator('#remindersNav').click()
    page.locator('#reminderTitle').fill('__browser_smoke__')
    page.locator('#reminderTime').fill((datetime.now()+timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M'))
    page.get_by_text('Review reminder',exact=True).click()
    page.get_by_text('Review & approve',exact=True).wait_for()
    assert '__browser_smoke__' in page.locator('.action-preview').inner_text()
    page.get_by_text('Approve & execute',exact=True).click()
    page.get_by_text('Done',exact=True).wait_for();assert 'saved' in page.locator('#toolResult').inner_text()
    page.get_by_text('Done',exact=True).click();page.locator('.reminder-item').filter(has_text='__browser_smoke__').wait_for()
    row=page.locator('.reminder-item').filter(has_text='__browser_smoke__')
    with page.expect_download() as event:row.get_by_text('Export calendar',exact=True).click()
    assert event.value.suggested_filename=='jarvis-reminder.ics'
    page.once('dialog',lambda d:d.accept());row.get_by_text('Delete',exact=True).click()
    row.wait_for(state='detached');page.locator('#closePanel').click()
    # Gmail truthful setup state; no real account/mail operation.
    page.locator('#mailNav').click();page.get_by_text('Connect Gmail',exact=True).wait_for()
    page.get_by_text('Connect Gmail',exact=True).click()
    page.locator('#toolResult').filter(has_text='GOOGLE_CLIENT_ID').wait_for()
    page.locator('#closePanel').click()
    page.locator('#toolsNav').click();page.get_by_text('Desktop apps',exact=True).click()
    assert page.get_by_text('Open Notepad',exact=True).is_disabled()
    page.locator('#closePanel').click()
    # Image result safely rendered and downloadable from a controlled byte fixture.
    image_url='/api/images/11111111-1111-4111-8111-111111111111.png'
    page.route('**/api/images',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'reply':'Test image','imageUrl':image_url})))
    import base64
    page.route('**'+image_url,lambda route:route.fulfill(status=200,content_type='image/png',body=base64.b64decode(PNG)))
    page.locator('#newChat').click();page.locator('#prompt').fill('/image a test circle');page.locator('#sendButton').click()
    page.locator('.generated-image').wait_for();expect(page.locator('.generated-image')).to_have_js_property('naturalWidth',1)
    assert page.get_by_text('Download image',exact=True).count()==1
    # Attachment is reviewable text, never executed.
    page.locator('#attachment').set_input_files({'name':'sample.py','mimeType':'text/plain','buffer':b'print(1/0)'})
    assert 'print(1/0)' in page.locator('#prompt').input_value();assert page.locator('#chatMode').input_value()=='debug'
    page.locator('#settingsNav').click();assert page.locator('#voiceSelect').count()==1;page.locator('#closePanel').click()
    page.locator('#newChat').click();page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/jarvis-v2-mobile.png',full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('#menuButton').click();page.locator('#memoryNav').click()
    page.once('dialog',lambda d:d.accept());page.locator('.memory-row button').click();assert page.locator('.memory-row').count()==0
    page.locator('#closePanel').click();page.locator('#menuButton').click()
    page.once('dialog',lambda d:d.accept());page.locator('#clearHistory').click();assert page.locator('.history-row').count()==0
    page.reload();assert page.locator('#memoryCount').inner_text()=='0'
    assert not errors,errors
    browser.close()
    print('Browser smoke passed: desktop/mobile, explicit provider errors, grounded chat fixtures, safe sources/text, image fixture, attachment review, local reminder approval/persistence/export/deletion, Gmail setup error, disabled non-Windows actions, history/memory/settings. External success fixtures do not validate live providers or Windows devices.')
