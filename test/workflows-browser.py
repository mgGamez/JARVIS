"""Run only against scripts/browser-fixture.js. No live Google or device actions."""
import os,json,shutil
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def nav(id):
  if not page.locator('#sidebar').evaluate("e=>e.classList.contains('open')"): page.locator('#menuButton').click()
  page.locator('#'+id).click()
 page.goto(os.environ.get('JARVIS_TEST_URL','http://127.0.0.1:3002'))
 assert page.request.get(os.environ.get('JARVIS_TEST_URL','http://127.0.0.1:3002')+'/api/status').json().get('testFixture') is True
 nav('workflowsNav');page.get_by_text('Build with Gemini',exact=True).wait_for()
 page.locator('#workflowPrompt').fill('Prepare a call brief for me to review. No email.')
 page.get_by_text('Build with Gemini',exact=True).click();page.locator('#workflowName').wait_for()
 assert page.locator('#workflowName').input_value()=='Call preparation'
 assert page.locator('.canvas-step').count()==3
 page.locator('.canvas-step').nth(1).click();page.locator('#stepInstructions').fill('Prepare a short brief; flag unconfirmed dates.')
 page.get_by_text('Trigger, recipient & saved notes',exact=True).click()
 page.locator('#workflowNotes').fill('Fictional call notes. Discuss next step; date unknown.')
 page.get_by_text('Save draft',exact=True).click();page.locator('#automationResult').filter(has_text='Draft saved').wait_for()
 page.get_by_text('Publish version',exact=True).click();page.locator('#automationResult').filter(has_text='Published v1').wait_for()
 page.locator('.canvas-step').nth(1).click();page.screenshot(path='/tmp/jarvis-workflow-desktop.png',full_page=True)
 page.get_by_text('Run published version',exact=True).click();page.get_by_text('Approve exact action',exact=True).wait_for(timeout=20000)
 assert 'Controlled call brief' in page.locator('#runList').inner_text()
 page.get_by_text('Approve exact action',exact=True).click();expect(page.locator('#runList')).to_contain_text('completed',timeout=20000)
 # Authority and shared context persist on the server.
 page.locator('#closePanel').click();nav('authorityNav');page.locator('#rule-source-read').select_option('block')
 page.get_by_text('Save rules',exact=True).click();page.locator('#automationResult').filter(has_text='saved').wait_for()
 page.locator('#closePanel').click();nav('contextNav');page.locator('#context-goal').fill('Approved UI test goal')
 page.get_by_text('Approve & save shared context',exact=True).click();page.locator('#automationResult').filter(has_text='saved').wait_for()
 page.locator('#closePanel').click();page.reload();nav('contextNav');assert page.locator('#context-goal').input_value()=='Approved UI test goal'
 # One-time pairing token is visible only after the explicit pairing action.
 page.locator('#closePanel').click();nav('devicesNav');page.locator('#deviceName').fill('UI test laptop')
 page.get_by_text('Pair computer',exact=True).click();page.locator('.action-preview').filter(has_text='JARVIS_DEVICE_TOKEN=').wait_for()
 token=page.locator('.action-preview').inner_text().split('=',1)[1].strip();assert len(token)==64
 # Do not screenshot or log the pairing token.
 page.locator('#closePanel').click();page.reload();nav('devicesNav');assert token not in page.locator('#panelContent').inner_text()
 page.locator('#deviceCommand').select_option('browser.navigate');page.get_by_text('Review device task',exact=True).click()
 page.get_by_text('Approve & queue task',exact=True).wait_for();page.get_by_text('Approve & queue task',exact=True).click()
 page.locator('#automationResult').filter(has_text='Task queued').wait_for()
 page.once('dialog',lambda d:d.accept());page.get_by_text('Revoke pairing',exact=True).click();page.locator('#automationResult').filter(has_text='Pairing revoked').wait_for()
 page.locator('#closePanel').click();page.set_viewport_size({'width':390,'height':844});nav('workflowsNav')
 page.get_by_text('Open canvas',exact=True).click();page.screenshot(path='/tmp/jarvis-workflow-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 browser.close();print('Workflow UI passed: prompt fixture, editable canvas, save/publish, paused run approval/completion, persistent authority/context, one-time pairing, approved device queue/revocation, desktop/mobile. No real mail or device tasks executed.')
