"""Run against a fresh browser-fixture server. No live provider/account writes."""
import os,shutil
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1360,'height':960});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('JARVIS_TEST_URL','http://127.0.0.1:3004'))
 assert page.request.get(os.environ.get('JARVIS_TEST_URL','http://127.0.0.1:3004')+'/api/status').json().get('testFixture') is True
 page.locator('#hudWorkspace').click();page.get_by_text('AI Core',exact=True).last.click();page.locator('#aiPrivacy').wait_for()
 assert page.locator('#aiProvider option').count()==7
 page.locator('#aiPrivacy').select_option('strict');page.get_by_text('Save AI settings',exact=True).click()
 page.locator('#coreResult').filter(has_text='saved').wait_for();assert page.locator('#micButton').is_disabled();page.get_by_text('Test selected provider',exact=True).click()
 page.locator('#coreResult').filter(has_text='Strict privacy').wait_for()
 page.locator('#aiPrivacy').select_option('guarded');page.get_by_text('Save AI settings',exact=True).click();page.locator('#coreResult').filter(has_text='saved').wait_for()
 page.locator('#closePanel').click();page.locator('#hudWorkspace').click();page.get_by_text('Memory vault',exact=True).click()
 page.locator('#vaultFact').fill('Project Aurora uses Python.');page.get_by_text('Approve & remember',exact=True).click();page.locator('#coreResult').filter(has_text='Fact saved').wait_for()
 page.locator('#vaultQuery').fill('Aurora');page.get_by_text('Search memory',exact=True).click();expect(page.locator('#memoryMatches')).to_contain_text('Project Aurora')
 page.locator('#closePanel').click();page.reload();page.locator('#hudWorkspace').click();page.get_by_text('Memory vault',exact=True).click();expect(page.locator('.workflow-card').filter(has_text='Project Aurora uses Python.')).to_contain_text('Project Aurora')
 page.once('dialog',lambda d:d.accept());page.locator('.workflow-card').filter(has_text='Project Aurora uses Python.').get_by_text('Forget',exact=True).click();expect(page.locator('.workflow-card').filter(has_text='Project Aurora uses Python.')).to_have_count(0)
 page.locator('#closePanel').click();page.locator('#hudWorkspace').click();page.get_by_text('GitHub',exact=True).click();page.locator('#githubRepo').fill('owner/repo')
 page.get_by_text('Read from GitHub',exact=True).click();page.locator('#coreResult').filter(has_text='read completed').wait_for();expect(page.locator('.run-output')).to_contain_text('Controlled commit')
 page.locator('#githubTitle').fill('Fixture issue');page.locator('#githubBody').fill('Controlled test only.');page.get_by_text('Review new issue',exact=True).click()
 page.get_by_text('Approve & execute',exact=True).wait_for();expect(page.locator('.action-preview')).to_contain_text('Fixture issue')
 page.get_by_text('Approve & execute',exact=True).click();expect(page.locator('.tool-result')).to_contain_text('99')
 page.locator('#closePanel').click();page.locator('#hudWorkspace').click();page.get_by_text('Agent tasks',exact=True).click()
 page.locator('#agentGoal').fill('Summarize recent GitHub commits in owner/repo.');page.get_by_text('Start task',exact=True).click()
 expect(page.locator('#taskEvents')).to_contain_text('Controlled commit summary.',timeout=20000)
 page.screenshot(path='/tmp/jarvis-agent-desktop.png',full_page=True)
 assert not errors,errors
 browser.close();print('Core UI passed: seven provider settings, strict cloud rejection, approved SQLite memory/search/forget, GitHub read and approved issue fixture, streamed task activity. External providers/writes were controlled fixtures.')
