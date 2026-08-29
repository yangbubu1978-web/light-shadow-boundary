// ========================================
// Fragments of Light - Gallery Script
// (Optimized: Batch rendering + Lightbox preload + Shared observer)
// ========================================

// Google Drive API Configuration
const GOOGLE_DRIVE_API_KEY='AIzaSyAJLrXNPtsvghA3ApipFmyi3YXZvubweuw';
const DRIVE_FOLDER_ID = '1_hW6kUof0k79p4GWrcIeWFBLlCghGPUE';

// Image list
let allImages = [];
let showOnlyNew = false;

// ========================================
// First-visit Loading Progress
// ========================================
let siteLoaderProgress = 0;
let driveRequestCount = 0;
let siteLoaderFinished = false;

function updateSiteLoader(progress, message, detail) {
    if (siteLoaderFinished) return;

    siteLoaderProgress = Math.max(siteLoaderProgress, Math.min(100, Math.round(progress)));
    var bar = document.getElementById('site-loader-bar');
    var percent = document.getElementById('site-loader-percent');
    var messageEl = document.getElementById('site-loader-message');
    var detailEl = document.getElementById('site-loader-detail');
    var loader = document.getElementById('site-loader');

    if (bar) bar.style.width = siteLoaderProgress + '%';
    if (percent) percent.textContent = siteLoaderProgress + '%';
    if (message && messageEl) messageEl.textContent = message;
    if (detail && detailEl) detailEl.textContent = detail;
    if (loader) loader.setAttribute('aria-label', '作品載入進度 ' + siteLoaderProgress + '%');
}

function dismissSiteLoader() {
    if (siteLoaderFinished) return;
    siteLoaderFinished = true;

    var loader = document.getElementById('site-loader');
    document.body.classList.remove('site-loading');
    if (loader) loader.classList.add('is-complete');
}

function finishSiteLoader() {
    updateSiteLoader(100, '作品準備完成', '歡迎走進光影的交界處');
    window.setTimeout(dismissSiteLoader, 480);
}

function noteDriveRequest() {
    driveRequestCount++;
    // The number of nested Drive folders is unknown, so metadata progress
    // approaches 55% without pretending that we know the final request count.
    var progress = 12 + 43 * (1 - Math.exp(-driveRequestCount / 4));
    updateSiteLoader(progress, '正在整理作品索引', '已讀取 ' + driveRequestCount + ' 個作品區段');
}

function setupSiteLoader() {
    updateSiteLoader(6, '正在連線至作品集', '讓光影慢慢浮現');

    var skipButton = document.getElementById('site-loader-skip');
    if (skipButton) {
        skipButton.addEventListener('click', dismissSiteLoader);
        window.setTimeout(function() {
            if (!siteLoaderFinished) skipButton.classList.add('is-visible');
        }, 8000);
    }

    // Never trap a visitor behind the loading screen if a third-party request stalls.
    window.setTimeout(function() {
        if (!siteLoaderFinished) {
            updateSiteLoader(96, '網路回應較慢', '作品仍會在背景繼續載入');
            if (skipButton) skipButton.classList.add('is-visible');
        }
    }, 12000);
}

// ========================================
// Shared Global Intersection Observer
// ========================================
let globalObserver = null;
let imageLoadQueue = [];
let currentlyLoading = 0;
const MAX_CONCURRENT_LOADS = 8;  // Parallel loading for faster first paint

function initGlobalObserver() {
    if (globalObserver) return;
    globalObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                var img = entry.target;
                var src = img.dataset.src;
                if (src && !img.src) {
                    enqueueImageLoad(img, src);
                }
                globalObserver.unobserve(img);
            }
        });
    }, {
        rootMargin: '600px 0px 600px 0px'  // Preload well before viewport
    });
}

function observeImage(img) {
    if (!globalObserver) initGlobalObserver();
    globalObserver.observe(img);
}

// ========================================
// Image Load Queue (Concurrent)
// ========================================
function enqueueImageLoad(img, src) {
    // Avoid duplicate loads
    if (img.dataset.loaded === 'true') return;
    img.dataset.loaded = 'true';
    imageLoadQueue.push({ img, src });
    processImageQueue();
}

function processImageQueue() {
    while (currentlyLoading < MAX_CONCURRENT_LOADS && imageLoadQueue.length > 0) {
        const { img, src } = imageLoadQueue.shift();
        loadImage(img, src);
    }
}

function loadImage(img, src) {
    currentlyLoading++;
    const tempImg = new Image();
    tempImg.onload = function() {
        img.src = src;
        // 一併套用響應式 srcset，瀏覽器會依裝置像素密度選擇最佳縮圖
        if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
        }
        img.classList.add('loaded');
        img.dispatchEvent(new CustomEvent('gallery-image-settled', { detail: { success: true } }));
        currentlyLoading--;
        processImageQueue();
    };
    tempImg.onerror = function() {
        currentlyLoading--;
        processImageQueue();
        img.dataset.loaded = 'false'; // allow retry
        img.dispatchEvent(new CustomEvent('gallery-image-settled', { detail: { success: false } }));
        console.warn('Failed to load image:', src);
    };
    tempImg.src = src;
}

// ========================================
// Lightbox Preload Cache
// ========================================
let lightboxPreloadCache = new Map();

function preloadImage(fileId) {
    if (lightboxPreloadCache.has(fileId)) return;
    const url = getFullSizeUrl(fileId);
    const img = new Image();
    img.src = url;
    lightboxPreloadCache.set(fileId, img);
}

function preloadAdjacentImages(index) {
    const prev = currentLightboxImages[index - 1];
    const next = currentLightboxImages[index + 1];
    if (prev) preloadImage(prev.id);
    if (next) preloadImage(next.id);
}

// ========================================
// Google Drive API Functions (Recursive Subfolder Support)
// ========================================

async function fetchImagesFromDrive() {
    console.log('開始遞迴抓取 Google Drive 照片（含子資料夾）...');
    var allFiles = [];
    await getFilesRecursive(DRIVE_FOLDER_ID, allFiles);
    console.log('總共抓到 ' + allFiles.length + ' 張照片');
    return allFiles;
}

async function getFilesRecursive(folderId, accumulatedFiles) {
    var pageToken = null;
    
    do {
        var filesUrl = 'https://www.googleapis.com/drive/v3/files';
        var filesParams = {
            q: "'" + folderId + "' in parents and mimeType contains 'image/'",
            fields: 'files(id,name,mimeType,createdTime,imageMediaMetadata(width,height)),nextPageToken',
            pageSize: 1000,
            supportsAllDrives: true,
            key: GOOGLE_DRIVE_API_KEY,
            includeItemsFromAllDrives: true
        };
        
        if (pageToken) {
            filesParams.pageToken = pageToken;
        }
        
        var queryString = Object.keys(filesParams).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(filesParams[key]);
        }).join('&');
        
        var response = await fetch(filesUrl + '?' + queryString);
        noteDriveRequest();
        if (!response.ok) {
            console.error('API 錯誤 ' + response.status + ':', response.statusStatusText);
            throw new Error('API returned ' + response.status);
        }
        
        var data = await response.json();
        var files = data.files || [];
        
        for (var i = 0; i < files.length; i++) {
            var meta = files[i].imageMediaMetadata || {};
            accumulatedFiles.push({
                id: files[i].id,
                name: files[i].name || 'Untitled',
                createdTime: files[i].createdTime || null,
                width: meta.width || null,
                height: meta.height || null
            });
        }
        
        console.log('資料夾 ' + folderId + ' 抓到 ' + files.length + ' 張，累計: ' + accumulatedFiles.length + ' 張');
        pageToken = data.nextPageToken;
        
    } while (pageToken);
    
    // 再抓子資料夾
    var subfoldersToken = null;
    
    do {
        var foldersUrl = 'https://www.googleapis.com/drive/v3/files';
        var foldersParams = {
            q: "'" + folderId + "' in parents and mimeType = 'application/vnd.google-apps.folder'",
            fields: 'files(id,name,shortcutDetails),nextPageToken',
            pageSize: 1000,
            supportsAllDrives: true,
            key: GOOGLE_DRIVE_API_KEY,
            includeItemsFromAllDrives: true
        };
        
        if (subfoldersToken) {
            foldersParams.pageToken = subfoldersToken;
        }
        
        var foldersQueryString = Object.keys(foldersParams).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(foldersParams[key]);
        }).join('&');
        
        var foldersResponse = await fetch(foldersUrl + '?' + foldersQueryString);
        noteDriveRequest();
        if (!foldersResponse.ok) break;
        
        var foldersData = await foldersResponse.json();
        var subfolders = foldersData.files || [];
        subfoldersToken = foldersData.nextPageToken;
        
        for (var j = 0; j < subfolders.length; j++) {
            console.log('發現子資料夾: ' + subfolders[j].name);
            var actualFolderId = subfolders[j].id;
            if (subfolders[j].shortcutDetails && subfolders[j].shortcutDetails.targetId) {
                actualFolderId = subfolders[j].shortcutDetails.targetId;
                console.log('  (捷徑指向: ' + actualFolderId + ')');
            }
            await getFilesRecursive(actualFolderId, accumulatedFiles);
        }
        
    } while (subfoldersToken);
}

// ========================================
// Lightbox Navigation
// ========================================

function showLightboxImageAtIndex(index) {
    var nextImage = currentLightboxImages[index];
    if (!nextImage) return;
    currentLightboxImage = nextImage;
    var lightbox = document.querySelector('.lightbox');
    if (!lightbox) return;
    var lightboxImg = lightbox.querySelector('.lightbox-img');
    var currentNum = index + 1;
    var totalNum = currentLightboxImages.length;

    lightboxImg.src = getFullSizeUrl(nextImage.id);
    lightboxImg.alt = nextImage.name;

    // Preload adjacent images
    preloadAdjacentImages(index);

    var indicator = lightbox.querySelector('.lightbox-slide-indicator');
    if (indicator) {
        indicator.textContent = currentNum + ' / ' + totalNum;
    }
}

function nextLightboxImage() {
    try {
    currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxImages.length;
    showLightboxImageAtIndex(currentLightboxIndex);
    } catch (error) {
        console.error('Error navigating images:', error);
    }
}

function prevLightboxImage() {
    try {
    currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxImages.length) % currentLightboxImages.length;
    showLightboxImageAtIndex(currentLightboxIndex);
    } catch (error) {
        console.error('Error navigating images:', error);
    }
}

function closeLightbox() {
    var lightbox = document.querySelector('.lightbox');
    if (lightbox) {
        if (lightbox._trapHandler) {
            lightbox.removeEventListener('keydown', lightbox._trapHandler);
            lightbox._trapHandler = null;
        }
        lightbox.classList.remove('active');
    }
    document.body.style.overflow = '';
    currentLightboxImage = null;
    currentLightboxIndex = -1;
    // 還原焦點至觸發來源
    if (lightboxPreviousFocus && typeof lightboxPreviousFocus.focus === 'function') {
        lightboxPreviousFocus.focus();
    }
    lightboxPreviousFocus = null;
}

// ========================================
// Filter Toggle
// ========================================

function toggleNewFilter() {
    showOnlyNew = !showOnlyNew;
    var btn = document.querySelector('.nav-links .new-filter-btn');
    var floatingBtn = document.getElementById('floating-new-filter');

    if (showOnlyNew) {
        btn.classList.add('active');
        if (floatingBtn) floatingBtn.classList.add('active');
    } else {
        btn.classList.remove('active');
        if (floatingBtn) floatingBtn.classList.remove('active');
    }
    displayImages(allImages);
    document.getElementById('portfolio')?.scrollIntoView({ top: 0, behavior: 'smooth' });
}


// ========================================
// Hero Featured Image
// ========================================
function setupHeroImage() {
    var heroImg = document.getElementById('hero-featured-image');
    if (!heroImg || !allImages.length) return;
    
    // Pick a random image from ALL photos (not just the first 10)
    var shuffled = shuffleArray(allImages);
    var featuredImage = shuffled[Math.floor(Math.random() * shuffled.length)];
    var url = getThumbnailUrl(featuredImage.id).replace('=w900', '=w1200');
    
    var tempImg = new Image();
    tempImg.onload = function() {
        heroImg.src = url;
        heroImg.alt = featuredImage.name;
        setTimeout(function() { heroImg.classList.add('loaded'); }, 100);
    };
    tempImg.src = url;
}

// ========================================
// Standalone Page Images (about / contact)
// ========================================
async function setupPageImages() {
    // Find all decorative images on this page
    var targets = [];
    var portrait = document.getElementById('about-portrait');
    var contactImg = document.getElementById('contact-image');
    var img1 = document.getElementById('about-image-1');
    var img2 = document.getElementById('about-image-2');
    
    if (portrait) targets.push(portrait);
    if (contactImg) targets.push(contactImg);
    if (img1) targets.push(img1);
    if (img2) targets.push(img2);
    
    if (targets.length === 0) return;
    
    // Fetch images from Drive if not already loaded (standalone pages skip gallery)
    if (!allImages || !allImages.length) {
        try {
            allImages = await fetchImagesFromDrive();
        } catch (e) {
            console.error('Drive fetch failed for page images:', e.message);
        }
    }
    
    // Prefer NEW images (uploaded within 30 days); fall back to all images
    var pool;
    if (allImages && allImages.length) {
        var newImages = filterNew(allImages);
        pool = newImages.length ? newImages : allImages;
    } else {
        pool = getDefaultImages();
    }
    var shuffled = shuffleArray(pool);
    
    // Assign distinct images to each target
    targets.forEach(function(target, index) {
        if (!shuffled[index]) return;
        var img = shuffled[index];
        var url = getThumbnailUrl(img.id).replace('=w900', '=w1200');
        var temp = new Image();
        temp.onload = function() {
            target.src = url;
            target.alt = img.name;
            target.classList.add('loaded');
        };
        temp.src = url;
    });
}

// ========================================
// Navigation — Scroll Detection
// ========================================
function setupNavigationScroll() {
    var navbar = document.getElementById('navbar');
    var hero = document.getElementById('home');
    var progress = document.getElementById('scroll-progress');
    if (!navbar || !hero) {
        // 沒有 hero 的頁面（如 rewindpix）仍需進度條
        if (progress) {
            window.addEventListener('scroll', function() {
                var docH = document.documentElement.scrollHeight - window.innerHeight;
                var pct = docH > 0 ? (window.scrollY / docH) * 100 : 0;
                progress.style.width = pct + '%';
            }, { passive: true });
        }
        return;
    }
    
    function updateNav() {
        var scrollY = window.scrollY || window.pageYOffset;
        var heroBottom = hero.offsetHeight;
        
        // Add scrolled state
        if (scrollY > 50) {
            navbar.classList.add('is-scrolled');
        } else {
            navbar.classList.remove('is-scrolled');
        }
        
        // On dark hero section
        if (scrollY < heroBottom - 100) {
            navbar.classList.add('is-on-dark');
        } else {
            navbar.classList.remove('is-on-dark');
        }

        // 閱讀進度條
        if (progress) {
            var docH = document.documentElement.scrollHeight - window.innerHeight;
            var pct = docH > 0 ? (scrollY / docH) * 100 : 0;
            progress.style.width = pct + '%';
        }
    }
    
    window.addEventListener('scroll', updateNav, { passive: true });
    updateNav();
}

// ========================================
// Mobile Menu Toggle
// ========================================
function setupMobileMenu() {
    var toggle = document.getElementById('nav-menu-toggle');
    var menu = document.getElementById('nav-mobile-menu');
    if (!toggle || !menu) return;
    
    toggle.addEventListener('click', function() {
        var isOpen = menu.classList.contains('is-open');
        menu.classList.toggle('is-open');
        toggle.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', !isOpen);
        document.body.style.overflow = isOpen ? '' : 'hidden';
    });
    
    // Close on link click
    menu.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
            menu.classList.remove('is-open');
            toggle.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        });
    });
}

// ========================================
// Gallery Item Reveal Animation
// ========================================
var revealObserver = null;

function setupGalleryReveal() {
    if (!revealObserver) {
        revealObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.05, rootMargin: '80px' });
    }
    
    document.querySelectorAll('.gallery-item:not(.is-visible)').forEach(function(item) {
        revealObserver.observe(item);
    });
}

// ========================================
// Navigation Setup
// ========================================
function setupNavigation() {
    var navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    var newBtn = document.createElement('button');
    newBtn.className = 'new-filter-btn';
    newBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span class="new-filter-label">NEW</span>';
    newBtn.addEventListener('click', toggleNewFilter);
    navLinks.appendChild(newBtn);
    
    // Setup scroll detection and mobile menu
    setupNavigationScroll();
    setupMobileMenu();
}

// ========================================
// Load Images
// ========================================
async function loadImages() {
    // Skip on pages without a gallery (e.g. about.html, contact.html)
    if (!document.getElementById('gallery')) {
        if (document.getElementById('site-loader')) {
            finishSiteLoader();
        }
        // Load decorative images for standalone pages
        setupPageImages();
        return;
    }
    
    // Folder-specific mode: body[data-drive-folder] restricts the gallery
    // to one Drive folder (e.g. film.html → Rewindpix)
    var driveFolder = document.body.getAttribute('data-drive-folder');
    var cacheKey = 'fol-images-cache-v2';
    if (driveFolder) {
        cacheKey = 'fol-images-cache-v2-' + driveFolder.substring(0, 10);
    }
    
    showSkeleton(18);
    updateSiteLoader(10, '正在連線至作品集', '讀取 Google Drive 作品資料');
    
    try {
        allImages = [];
        // 先試 localStorage 快取（30 分鐘內避免重複打 API）
        var cached = null;
        try {
            var cacheRaw = localStorage.getItem(cacheKey);
            if (cacheRaw) {
                var cacheData = JSON.parse(cacheRaw);
                if (cacheData && cacheData.timestamp && (Date.now() - cacheData.timestamp) < 30 * 60 * 1000 && cacheData.images && cacheData.images.length) {
                    cached = cacheData.images;
                    console.log('使用快取照片清單 (' + cached.length + ' 張)');
                }
            }
        } catch (e) { /* ignore cache errors */ }
        
        if (cached) {
            allImages = cached;
        } else {
            try {
                if (driveFolder) {
                    console.log('載入指定資料夾: ' + driveFolder);
                    allImages = [];
                    await getFilesRecursive(driveFolder, allImages);
                } else {
                    allImages = await fetchImagesFromDrive();
                }
                console.log('Google Drive API returned', allImages.length, 'images');
                // 寫入快取
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        timestamp: Date.now(),
                        images: allImages
                    }));
                } catch (e) { /* storage full — ignore */ }
            } catch (e) {
                console.error('Google Drive API failed:', e.message);
                try {
                    var response = await fetch('images.json');
                    if (response.ok) {
                        var data = await response.json();
                        allImages = data.images || [];
                    }
                } catch (e2) {
                    allImages = getDefaultImages();
                }
            }
        }
        
        if (allImages.length === 0) {
            allImages = getDefaultImages();
        }
        
        updateSiteLoader(60, '作品索引已就緒', '找到 ' + allImages.length + ' 幅作品');
        displayImages(allImages);
        setupHeroImage();
        // 先放行網站（skeleton 佔位已就緒），照片在背景繼續載入
        finishSiteLoader();
        // 背景預載首批照片，不阻塞畫面
        preloadInitialGalleryImages().catch(function() {});
        
    } catch (error) {
        console.error('Error loading images:', error);
        var gallery = document.getElementById('gallery');
        gallery.innerHTML = '<div class="loading">載入失敗，請刷新重試。</div>';
        updateSiteLoader(100, '暫時無法載入作品', '請先進入網站，稍後重新整理');
        window.setTimeout(dismissSiteLoader, 900);
    }
}

function preloadInitialGalleryImages() {
    var targetCount = window.matchMedia('(max-width: 768px)').matches ? 6 : 10;
    var images = Array.prototype.slice.call(
        document.querySelectorAll('#gallery .gallery-item img'),
        0,
        targetCount
    );

    if (images.length === 0) return Promise.resolve();

    var settled = 0;
    updateSiteLoader(64, '正在準備第一批照片', '0 / ' + images.length + ' 幅作品');

    return Promise.all(images.map(function(img) {
        return new Promise(function(resolve) {
            var done = false;
            var timeoutId;

            function settle() {
                if (done) return;
                done = true;
                window.clearTimeout(timeoutId);
                settled++;
                var progress = 64 + (settled / images.length) * 32;
                updateSiteLoader(progress, '正在準備第一批照片', settled + ' / ' + images.length + ' 幅作品');
                resolve();
            }

            if (img.classList.contains('loaded')) {
                settle();
                return;
            }

            img.addEventListener('gallery-image-settled', settle, { once: true });
            timeoutId = window.setTimeout(settle, 10000);
            enqueueImageLoad(img, img.dataset.src);
        });
    }));
}

function getDefaultImages() {
    // 加上 createdTime 讓 NEW badge 可以正常顯示
    const now = new Date().toISOString();
    return [
        { id: '1YlU4y2WyzMdsuW6tR1Luo42ccVAuAt_H', name: '000089000007_48125894547_o.jpg', createdTime: now },
        { id: '12EJ1r5U7HgC4M-h0l8VmYhlIDEfhwzWt', name: '000089000006_48113653578_o.jpg', createdTime: now },
        { id: '1XgHcLkjLJM5AX2StJNicnjNqbEcI-2eP', name: '000089000005_48119883216_o.jpg', createdTime: now },
        { id: '1RlkPOKC5aaU1P4n2p25zqlbt9NNnOy5r', name: '000016650030_48102725516_o.jpg', createdTime: now },
        { id: '1hlldRFbTeAuybLzYrnMbBHKMacEORVLR', name: '000016650025_48097388867_o.jpg', createdTime: now },
        { id: '1oKF3f0M5lmpWFD9DGOtVAr_t1rcjpjJZ', name: '000016650027_48092987466_o.jpg', createdTime: now },
        { id: '1iJpP4J5C1QswEHH9YGeA3FUDYKa7ncwm', name: '000016650033_48049127462_o.jpg', createdTime: now },
        { id: '1OSBhks_-DrslKJ8SHuqFZILMxGx5aZH-', name: '000016650034_48055175693_o.jpg', createdTime: now },
        { id: '1rCxSrTLve-UzKATTl3qoD9MUesiv07d0', name: 'cnv000014_48024174878_o.jpg', createdTime: now },
        { id: '1guMq7L9OfXCogwVYWDIW39XBhgT970jl', name: 'cnv000010_48036529803_o.jpg', createdTime: now }
    ];
}

// ========================================
// URL Helpers
// ========================================
function getThumbnailUrl(fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w900';
}

// 響應式縮圖：600w 給手機 / 900w 給 retina 與平板 / 1600w 給桌面大螢幕
function getThumbnailSrcset(fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w600 600w,' +
           'https://lh3.googleusercontent.com/d/' + fileId + '=w900 900w,' +
           'https://lh3.googleusercontent.com/d/' + fileId + '=w1600 1600w';
}

function getFullSizeUrl(fileId) {
    // 加上尺寸上限，避免手機原圖（可能 4000px+ / 10MB+）拖垮 Lightbox 載入
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w1920';
}

// ========================================
// Shuffle & Sort
// ========================================
function shuffleArray(array) {
    var shuffled = array.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }
    return shuffled;
}

function sortByNewest(images) {
    return images.slice().sort(function(a, b) {
        var timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        var timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return timeB - timeA;
    });
}

function isNewImage(image) {
    if (!image.createdTime) return false;
    var created = new Date(image.createdTime).getTime();
    var now = Date.now();
    var thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return (now - created) < thirtyDays;
}

function filterNew(images) {
    return images.filter(isNewImage);
}

// ========================================
// Gallery Functions (Optimized)
// ========================================
function createGalleryItem(image) {
    var item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.imageId = image.id;
    // 無障礙：讓作品可用鍵盤操作
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', '開啟作品：' + (image.name || 'Untitled'));
    
    var img = document.createElement('img');
    img.dataset.src = getThumbnailUrl(image.id);
    img.dataset.srcset = getThumbnailSrcset(image.id);
    img.dataset.fullSrc = getFullSizeUrl(image.id);
    img.alt = '';  // 裝飾性圖片，資訊由父層 aria-label 提供，避免朗讀檔名
    // sizes: 依欄寬選擇合適的縮圖（3 欄 masonry，最大欄寬約 450px）
    img.sizes = '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw';
    img.decoding = 'async';
    
    img.onload = function() {
        img.classList.add('loaded');
    };
    
    // Use shared global observer (lazy load)
    observeImage(img);
    
    if (isNewImage(image)) {
        var newBadge = document.createElement('div');
        newBadge.className = 'new-badge';
        newBadge.textContent = 'NEW';
        item.appendChild(newBadge);
    }
    
    item.addEventListener('click', function() {
        openLightbox(image);
    });
    item.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLightbox(image);
        }
    });
    
    // Add hover overlay
    var overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';
    overlay.innerHTML = '<span>' + (image.name || 'Untitled') + '</span>';
    
    item.appendChild(img);
    item.appendChild(overlay);
    return item;
}

// ========================================
// Skeleton Loading
// ========================================
function showSkeleton(count) {
    count = count || 18;
    var gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div class="skeleton-container">';
    var container = gallery.querySelector('.skeleton-container');
    var heights = [200, 280, 240, 180, 320, 260, 220, 300, 190, 270];
    for (var i = 0; i < count; i++) {
        var skeleton = document.createElement('div');
        skeleton.className = 'skeleton-item';
        skeleton.style.height = heights[i % heights.length] + 'px';
        container.appendChild(skeleton);
    }
    var textContainer = document.createElement('div');
    textContainer.className = 'skeleton-text-container';
    textContainer.innerHTML = '<p class="skeleton-text">載入作品中</p><p class="skeleton-subtext">敬請期待</p>';
    gallery.appendChild(textContainer);
}

function removeSkeleton() {
    var gallery = document.getElementById('gallery');
    var skeleton = gallery.querySelector('.skeleton-container');
    var skeletonText = gallery.querySelector('.skeleton-text-container');
    if (skeleton) skeleton.remove();
    if (skeletonText) skeletonText.remove();
}

// ========================================
// Lightbox Variables
// ========================================
var currentLightboxImage = null;
var currentLightboxIndex = -1;
var currentLightboxImages = [];
var lightboxPreviousFocus = null;

function openLightbox(image) {
    currentLightboxImage = image;
    currentLightboxIndex = currentLightboxImages.findIndex(function(img) { return img.id === image.id; });
    // 記住觸發來源，關閉時還原焦點
    lightboxPreviousFocus = document.activeElement;
    
    var lightbox = document.querySelector('.lightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        document.body.appendChild(lightbox);
    }
    // 無障礙：宣告為對話框
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', '作品檢視：' + (image.name || 'Untitled'));
    
    var currentNum = currentLightboxIndex + 1;
    var totalNum = currentLightboxImages.length;
    
    lightbox.innerHTML =
        '<button class="lightbox-close-btn" aria-label="關閉">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line>' +
        '<line x1="6" y1="6" x2="18" y2="18"></line>' +
        '</svg>' +
        '</button>' +
        '<button class="lightbox-nav-btn lightbox-nav-btn--prev" aria-label="上一張">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<polyline points="15 18 9 12 15 6"></polyline>' +
        '</svg>' +
        '</button>' +
        '<button class="lightbox-nav-btn lightbox-nav-btn--next" aria-label="下一張">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<polyline points="9 18 15 12 9 6"></polyline>' +
        '</svg>' +
        '</button>' +
        '<div class="lightbox-slide-indicator" aria-live="polite">' + currentNum + ' / ' + totalNum + '</div>' +
        '<img src="" alt="" class="lightbox-img" decoding="async">';
    
    var lightboxImg = lightbox.querySelector('.lightbox-img');
    lightboxImg.src = getFullSizeUrl(image.id);
    
    // Preload adjacent images immediately
    preloadAdjacentImages(currentLightboxIndex);
    
    lightbox.classList.add('active');
    // 鎖定背景滾動
    document.body.style.overflow = 'hidden';
    // 將焦點移至關閉鈕（焦點陷阱起點）
    setTimeout(function() {
        var closeBtn = lightbox.querySelector('.lightbox-close-btn');
        if (closeBtn) closeBtn.focus();
    }, 30);
    
    var closeBtn = lightbox.querySelector('.lightbox-close-btn');
    closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeLightbox();
    });
    
    var prevBtn = lightbox.querySelector('.lightbox-nav-btn--prev');
    prevBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        prevLightboxImage();
    });
    
    var nextBtn = lightbox.querySelector('.lightbox-nav-btn--next');
    nextBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        nextLightboxImage();
    });
    
    // 點圖片右半 = 下一張、左半 = 上一張（桌機慣用手勢）
    lightboxImg.addEventListener('click', function(e) {
        e.stopPropagation();
        var rect = lightboxImg.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        if (clickX > rect.width / 2) {
            nextLightboxImage();
        } else {
            prevLightboxImage();
        }
    });
    
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
    
    // 焦點陷阱：Tab 僅在 Lightbox 內循環
    lightbox._trapHandler = function(e) {
        if (e.key !== 'Tab') return;
        var focusable = lightbox.querySelectorAll('button:not([disabled])');
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    lightbox.addEventListener('keydown', lightbox._trapHandler);
    
    // 手機滑動切換（touch swipe）
    var touchStartX = 0;
    var touchStartY = 0;
    lightbox.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    lightbox.addEventListener('touchend', function(e) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = e.changedTouches[0].clientY - touchStartY;
        // 水平滑動超過 50px 且垂直位移不大才算滑動
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) {
                nextLightboxImage();  // 往左滑 = 下一張
            } else {
                prevLightboxImage();  // 往右滑 = 上一張
            }
        }
    }, { passive: true });
}

// ========================================
// Display Images (Batch Render)
// ========================================
function displayImages(images) {
    var gallery = document.getElementById('gallery');
    removeSkeleton();
    
    if (images.length === 0) {
        gallery.innerHTML = '<div class="no-likes-message"><p>光尚未抵達——</p><p style="margin-top:8px; font-size:12px; letter-spacing:0.08em; opacity:0.6;">作品準備中，稍後再來看看吧</p></div>';
        currentLightboxImages = [];
        return;
    }
    
    var displayOrder;
    if (showOnlyNew) {
        displayOrder = sortByNewest(filterNew(images));
    } else {
        displayOrder = shuffleArray(images);
    }
    
    currentLightboxImages = displayOrder.slice();
    gallery.innerHTML = '';
    
    // Clear preload cache on re-render
    lightboxPreloadCache.clear();
    
    // Batch render: only create first batch immediately
    // 首批 24 張：3 欄 × 8 排，足以填滿首屏；其餘按滾動分批載入
    var FIRST_BATCH = 24;
    var REMAINING_BATCH = 24;
    
    for (var i = 0; i < Math.min(FIRST_BATCH, displayOrder.length); i++) {
        gallery.appendChild(createGalleryItem(displayOrder[i]));
    }
    
    // Load more as user scrolls
    if (displayOrder.length > FIRST_BATCH) {
        loadMoreBatches(gallery, displayOrder, FIRST_BATCH, REMAINING_BATCH);
    }
    
    // Setup reveal animation for new items
    setTimeout(setupGalleryReveal, 100);
}

function loadMoreBatches(gallery, displayOrder, startIndex, batchSize) {
    var galleryObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                var sentinel = entry.target;
                loadNextBatch(gallery, displayOrder, startIndex, batchSize, sentinel, galleryObserver);
                galleryObserver.unobserve(sentinel);
            }
        });
    }, { rootMargin: '400px' });
    
    // Create sentinel at end of current content
    var sentinel = document.createElement('div');
    sentinel.id = 'gallery-scroll-sentinel';
    gallery.appendChild(sentinel);
    galleryObserver.observe(sentinel);
}

function loadNextBatch(gallery, displayOrder, startIndex, batchSize, sentinel, galleryObserver) {
    var fragment = document.createDocumentFragment();
    var end = Math.min(startIndex + batchSize, displayOrder.length);
    
    for (var i = startIndex; i < end; i++) {
        fragment.appendChild(createGalleryItem(displayOrder[i]));
    }
    
    gallery.insertBefore(fragment, sentinel);
    
    // Setup reveal animation for newly added items
    setupGalleryReveal();
    
    var nextStart = startIndex + batchSize;
    if (nextStart < displayOrder.length) {
        // Update sentinel position reference for next batch
        loadMoreBatches(gallery, displayOrder, nextStart, batchSize);
    } else {
        // All loaded, remove sentinel
        if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
    }
    galleryObserver.disconnect();
}

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    setupSiteLoader();
    initGlobalObserver();
    setupNavigation();
    loadImages();
    
    var floatingNewBtn = document.getElementById('floating-new-filter');
    if (floatingNewBtn) {
        floatingNewBtn.addEventListener('click', function() {
            toggleNewFilter();
        });
    }
    
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    window.addEventListener('scroll', function() {
        var sections = document.querySelectorAll('section[id]');
        var navLinks = document.querySelectorAll('.nav-links a');
        
        var current = '';
        sections.forEach(function(section) {
            var sectionTop = section.offsetTop;
            if (scrollY >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(function(link) {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    });
    
    document.addEventListener('keydown', function(e) {
        var lightbox = document.querySelector('.lightbox');
        var lightboxActive = lightbox && lightbox.classList.contains('active');
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (lightboxActive && e.key === 'ArrowLeft') {
            prevLightboxImage();
        } else if (lightboxActive && e.key === 'ArrowRight') {
            nextLightboxImage();
        }
    });
});
