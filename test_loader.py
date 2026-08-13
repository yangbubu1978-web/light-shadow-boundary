from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
SCREENSHOTS = ROOT / ".test-artifacts"
SCREENSHOTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="/Applications/Chromium.app/Contents/MacOS/Chromium",
    )

    # Test 1: Mobile + intentionally slowed network keeps a meaningful loader visible.
    mobile = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
    )
    page = mobile.new_page()
    cdp = mobile.new_cdp_session(page)
    cdp.send("Network.enable")
    cdp.send("Network.emulateNetworkConditions", {
        "offline": False,
        "latency": 650,
        "downloadThroughput": 180 * 1024 / 8,
        "uploadThroughput": 90 * 1024 / 8,
        "connectionType": "cellular3g",
    })
    page.goto("http://127.0.0.1:8765/", wait_until="domcontentloaded", timeout=120000)
    page.wait_for_timeout(1800)
    loader = page.locator("#site-loader")
    assert loader.is_visible(), "Loader should be visible while the first gallery images are pending"
    percent_text = page.locator("#site-loader-percent").inner_text()
    percent = int(percent_text.rstrip("%"))
    assert 0 < percent < 100, f"Expected in-progress value, got {percent_text}"
    assert page.locator("#site-loader-message").inner_text().strip(), "Loader status should not be blank"
    page.screenshot(path=str(SCREENSHOTS / "loader-mobile-slow.png"), full_page=False)
    print(f"slow-mobile: visible, progress={percent_text}")
    mobile.close()

    # Test 2: Normal desktop load reaches gallery and removes the blocking state.
    desktop = browser.new_context(viewport={"width": 1440, "height": 900})
    page = desktop.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:8765/", wait_until="domcontentloaded", timeout=120000)
    page.wait_for_function("document.body.classList.contains('site-loading') === false", timeout=120000)
    page.wait_for_selector("#gallery .gallery-item img.loaded", timeout=120000)
    loaded = page.locator("#gallery .gallery-item img.loaded").count()
    items = page.locator("#gallery .gallery-item").count()
    assert loaded > 0, "At least one photo should be loaded before loader dismissal"
    assert items > 0, "Gallery should contain photos"
    loader_class = page.locator("#site-loader").get_attribute("class") or ""
    assert "is-complete" in loader_class
    assert not errors, f"Browser page errors: {errors}"
    print(f"desktop-complete: gallery_items={items}, loaded_images={loaded}, page_errors=0")
    desktop.close()

    # Test 3: Mobile skip control appears after a prolonged wait and actually releases scrolling.
    skip_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = skip_context.new_page()
    page.add_init_script("""
        const originalFetch = window.fetch.bind(window);
        window.fetch = (url, options) => String(url).includes('www.googleapis.com')
            ? new Promise(() => {})
            : originalFetch(url, options);
    """)
    page.goto("http://127.0.0.1:8765/", wait_until="domcontentloaded", timeout=120000)
    page.wait_for_selector("#site-loader-skip.is-visible", timeout=11000)
    page.locator("#site-loader-skip").click()
    page.wait_for_function("document.body.classList.contains('site-loading') === false")
    print("skip-fallback: visible after timeout and dismisses loader")
    skip_context.close()

    browser.close()
