"""Optional browser smoke test: pip install playwright; start npm start first.
Uses Chromium if installed, otherwise Playwright's managed Chromium.
AI success is intercepted test data, never a live Gemini validation.
"""
import os
import shutil
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('JARVIS_TEST_URL', 'http://127.0.0.1:3000'))
    page.get_by_text('Setup required', exact=True).wait_for()
    page.screenshot(path='/tmp/jarvis-desktop.png', full_page=True)
    page.locator('[data-prompt]').first.click()
    assert page.locator('#prompt').input_value().startswith('Help me plan')
    page.locator('#sendButton').click()
    page.get_by_text('Request failed', exact=True).wait_for()
    assert 'not configured' in page.locator('#notice').inner_text()
    assert page.locator('.message.assistant').count() == 0
    page.locator('#memoryNav').click()
    page.locator('#memoryInput').fill('I prefer concise answers.')
    page.get_by_text('Approve & save memory', exact=True).click()
    assert page.locator('.memory-row').count() == 1
    page.locator('#closePanel').click()
    page.reload()
    assert page.locator('#memoryCount').inner_text() == '1'
    assert page.locator('.history-row').count() == 1
    page.locator('.history-link').first.click()
    assert page.locator('.message.user').count() == 1
    calls = []
    def reply(route):
        data = route.request.post_data_json
        calls.append(data)
        route.fulfill(status=200, content_type='application/json', body='{"reply":"Test-only response <script>alert(1)</script>","model":"test"}')
    page.route('**/api/chat', reply)
    page.locator('#prompt').fill('Browser test message')
    page.locator('#sendButton').click()
    page.locator('.message.assistant').wait_for()
    assert calls[0]['memory'] == ['I prefer concise answers.']
    assert calls[0]['messages'] == [{'role': 'user', 'content': 'Browser test message'}]
    assert '<script>alert(1)</script>' in page.locator('.message.assistant .message-body').inner_text()
    assert page.locator('#messages script').count() == 0
    page.reload()
    page.locator('.history-link').first.click()
    assert page.locator('.message.assistant').count() == 1
    page.locator('#toolsNav').click()
    assert page.get_by_text('PLANNED', exact=True).count() == 4
    page.locator('#closePanel').click()
    page.locator('#settingsNav').click()
    assert page.locator('#voiceSelect').count() == 1
    page.locator('#closePanel').click()
    page.locator('#newChat').click()
    assert page.locator('#stage').is_visible()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path='/tmp/jarvis-mobile.png', full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('#menuButton').click()
    page.locator('#memoryNav').click()
    assert page.locator('#panel').is_visible()
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('.memory-row button').click()
    assert page.locator('.memory-row').count() == 0
    page.locator('#closePanel').click()
    page.locator('#menuButton').click()
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#clearHistory').click()
    assert page.locator('.history-row').count() == 0
    page.reload()
    assert page.locator('#memoryCount').inner_text() == '0'
    assert page.locator('.history-row').count() == 0
    assert errors == [], errors
    browser.close()
    print('Browser smoke passed: desktop/mobile layout, missing-key error, intercepted AI chat, safe text rendering, history persistence/deletion, approved memory payload/deletion, settings and capabilities. Real microphone/TTS and live Gemini not validated.')
