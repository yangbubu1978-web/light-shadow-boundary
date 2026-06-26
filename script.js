// ========================================
// The Light-Shadow Boundary - Gallery Script
// ========================================

// Google Drive API Configuration
const GOOGLE_DRIVE_API_KEY='AIzaSyAJLrXNPtsvghA3ApipFmyi3YXZvubweuw';
const DRIVE_FOLDER_ID = '1_hW6kUof0k79p4GWrcIeWFBLlCghGPUE';

// Image list
let allImages = [];
let showOnlyNew = false;

// ========================================
// Image Loading Queue (Performance Optimization)
// ========================================
const MAX_CONCURRENT_LOADS = 3;  // Limit concurrent image loads
let imageLoadQueue = [];
let currentlyLoading = 0;

function enqueueImageLoad(img, src) {
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
        img.classList.add('loaded');
        currentlyLoading--;
        processImageQueue();
    };

    tempImg.onerror = function() {
        // Still count as loaded to unblock queue
        currentlyLoading--;
        processImageQueue();
        console.warn('Failed to load image:', src);
    };

    tempImg.src = src;
}


// ========================================
// Google Drive API Functions (Recursive Subfolder Support)
// ========================================

// 遞迴抓取某資料夾及其所有子資料夾內的圖片
async function fetchImagesFromDrive() {
    console.log('開始遞迴抓取 Google Drive 照片（含子資料夾）...');
    var allFiles = [];
    await getFilesRecursive(DRIVE_FOLDER_ID, allFiles);
    console.log('總共抓到 ' + allFiles.length + ' 張照片');
    return allFiles;
}

// 遞迴取得某資料夾內的所有檔案（不限層級）
async function getFilesRecursive(folderId, accumulatedFiles) {
    var pageToken = null;
    
    do {
        var filesUrl = 'https://www.googleapis.com/drive/v3/files';
        var filesParams = {
            q: "'" + folderId + "' in parents and mimeType contains 'image/'",
            fields: 'files(id,name,mimeType,createdTime),nextPageToken',
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
        if (!response.ok) {
            console.error('API 錯誤 ' + response.status + ':', response.statusText);
            var errorText = await response.text().catch(() => '無法取得錯誤詳情');
            console.error('錯誤內容:', errorText);
            throw new Error('API returned ' + response.status);
        }
        
        var data = await response.json();
        var files = data.files || [];
        
        for (var i = 0; i < files.length; i++) {
            accumulatedFiles.push({
                id: files[i].id,
                name: files[i].name || 'Untitled',
                createdTime: files[i].createdTime || null
            });
        }
        
        console.log('資料夾 ' + folderId + ' 抓到 ' + files.length + ' 張，累計: ' + accumulatedFiles.length + ' 張');
        
        pageToken = data.nextPageToken;
        
    } while (pageToken);
    
    // 再抓這個資料夾裡的所有子資料夾
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
        if (!foldersResponse.ok) {
            console.error('抓取子資料夾失敗: ' + foldersResponse.status);
            break;
        }
        
        var foldersData = await foldersResponse.json();
        var subfolders = foldersData.files || [];
        
        subfoldersToken = foldersData.nextPageToken;
        
        for (var j = 0; j < subfolders.length; j++) {
            console.log('發現子資料夾: ' + subfolders[j].name);
            // 如果是捷徑，用捷徑的 targetId；否則用資料夾本身的 id
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

function nextLightboxImage() {
    try {
    
    // Cycle to next image
    currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxImages.length;
    var nextImage = currentLightboxImages[currentLightboxIndex];
    
    if (!nextImage) return;
    
    currentLightboxImage = nextImage;
    var lightbox = document.querySelector('.lightbox');
    if (!lightbox) return;
    
    var lightboxImg = lightbox.querySelector('.lightbox-img');
    var currentNum = currentLightboxIndex + 1;
    var totalNum = currentLightboxImages.length;
    
    // Update image
    lightboxImg.src = getFullSizeUrl(nextImage.id);
    lightboxImg.alt = nextImage.name;
    
    // Update slide indicator
    var indicator = lightbox.querySelector('.lightbox-slide-indicator');
    if (indicator) {
        indicator.textContent = currentNum + ' / ' + totalNum;
    }
    } catch (error) {
        console.error('Error navigating images:', error);
    }
}

function closeLightbox() {
    var lightbox = document.querySelector('.lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
    }
    currentLightboxImage = null;
    currentLightboxIndex = -1;
}

// ========================================
// Filter Toggle (Heart + New)
// ========================================

function toggleNewFilter() {
    showOnlyNew = !showOnlyNew;
    var btn = document.querySelector('.nav-links .new-filter-btn');
    var floatingBtn = document.getElementById('floating-new-filter');

    if (showOnlyNew) {
        btn.classList.add('active');
        if (floatingBtn) floatingBtn.classList.add('active');
        displayImages(allImages);
        document.getElementById('portfolio')?.scrollIntoView({ top: 0, behavior: 'smooth' });
    } else {
        btn.classList.remove('active');
        if (floatingBtn) floatingBtn.classList.remove('active');
        displayImages(allImages);
    }
}

// ========================================
// Navigation Setup
// ========================================
function setupNavigation() {
    var navLinks = document.querySelector('.nav-links');

    // NEW Filter Button
    var newBtn = document.createElement('button');
    newBtn.className = 'new-filter-btn';
    newBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span class="new-filter-label">NEW</span>';
    newBtn.addEventListener('click', toggleNewFilter);

    navLinks.appendChild(newBtn);
}

// ========================================
// Load Images - Google Drive API 優先
// ========================================
async function loadImages() {
    showSkeleton(18);
    
    try {

        
        
        // Try Google Drive API first (to get all photos including subfolders)
        allImages = [];
        try {
            allImages = await fetchImagesFromDrive();
            console.log('Google Drive API returned', allImages.length, 'images');
        } catch (e) {
            console.error('Google Drive API failed:', e.message);
            console.error('Error details:', e);
            console.log('Falling back to images.json...');
            try {
                var response = await fetch('images.json');
                if (response.ok) {
                    var data = await response.json();
                    allImages = data.images || [];
                    console.log('images.json loaded', allImages.length, 'images (fallback mode)');
                } else {
                    console.log('images.json also failed');
                    allImages = getDefaultImages();
                }
            } catch (e2) {
                console.log('images.json also failed:', e2.message);
                allImages = getDefaultImages();
            }
        }
        
        if (allImages.length === 0) {
            allImages = getDefaultImages();
        }
        
        displayImages(allImages);
        
    } catch (error) {
        console.error('Error loading images:', error);
        var gallery = document.getElementById('gallery');
        gallery.innerHTML = '<div class="loading">載入失敗，請刷新重試。</div>';
    }
}

function getDefaultImages() {
    return [
        { id: '1YlU4y2WyzMdsuW6tR1Luo42ccVAuAt_H', name: '000089000007_48125894547_o.jpg' },
        { id: '12EJ1r5U7HgC4M-h0l8VmYhlIDEfhwzWt', name: '000089000006_48113653578_o.jpg' },
        { id: '1XgHcLkjLJM5AX2StJNicnjNqbEcI-2eP', name: '000089000005_48119883216_o.jpg' },
        { id: '1RlkPOKC5aaU1P4n2p25zqlbt9NNnOy5r', name: '000016650030_48102725516_o.jpg' },
        { id: '1hlldRFbTeAuybLzYrnMbBHKMacEORVLR', name: '000016650025_48097388867_o.jpg' },
        { id: '1oKF3f0M5lmpWFD9DGOtVAr_t1rcjpjJZ', name: '000016650027_48092987466_o.jpg' },
        { id: '1iJpP4J5C1QswEHH9YGeA3FUDYKa7ncwm', name: '000016650033_48049127462_o.jpg' },
        { id: '1OSBhks_-DrslKJ8SHuqFZILMxGx5aZH-', name: '000016650034_48055175693_o.jpg' },
        { id: '1rCxSrTLve-UzKATTl3qoD9MUesiv07d0', name: 'cnv000014_48024174878_o.jpg' },
        { id: '1guMq7L9OfXCogwVYWDIW39XBhgT970jl', name: 'cnv000010_48036529803_o.jpg' },
        { id: '1X0P5J0R1Hw_3_ingAZ8HpJEB6ZND6Tjg', name: 'cnv000029_48018712302_o.jpg' },
        { id: '1-UmfKY5YxR3B6oTGu6NA4SFA-mS47JtS', name: 'cnv000012_48030482656_o.jpg' },
        { id: '1nJEnzFM1tEWLEjM7ck4rddi0XizbpEho', name: 'cnv000022_48043569352_o.jpg' },
        { id: '1882Vwft4h_ifgBOw5UlRC_MkvQIb4-np', name: 'cnv000016_48006681016_o.jpg' },
        { id: '1kOREo49cXHRU-vir-sZf4FJbwReJZ65U', name: 'cnv000025_47972674711_o.jpg' },
        { id: '1S9EA2aZbuRzs36trClV2k14A3TYjvYm1', name: 'cnv000026_47984586543_o.jpg' },
        { id: '1KnINNtB-q4CmJ44mIRRLkarFfCOuIdvc', name: 'cnv000024_47972617552_o.jpg' },
        { id: '1oFpEblVBEZjVrGIbDLvMTeadwg-Z8uhQ', name: 'cnv000015_47999798363_o.jpg' },
        { id: '1fwy8Er5_UQKuCgR7Y3EgYUM7elfvWY0I', name: 'cnv000019_47993133231_o.jpg' },
        { id: '1R6g6IAc7YauiiyIR5TD-AhR-PTij5lIq', name: 'cnv000020_48013069612_o.jpg' }
    ];
}



// ========================================
// URL Helpers
// ========================================
function getThumbnailUrl(fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w400';
}

function getFullSizeUrl(fileId) {
    return 'https://lh3.googleusercontent.com/d/' + fileId;
}

// ========================================
// Shuffle & Sort Functions
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
// Gallery Functions
// ========================================
function createGalleryItem(image) {
    var item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.imageId = image.id;
    
    var img = document.createElement('img');
    img.dataset.src = getThumbnailUrl(image.id);
    img.dataset.fullSrc = getFullSizeUrl(image.id);
    img.alt = image.name;
    
    img.onload = function() {
        img.classList.add('loaded');
    };
    
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries, obs) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var lazyImg = entry.target;
                    var src = lazyImg.dataset.src;
                    if (src) {
                        enqueueImageLoad(lazyImg, src);
                    }
                    obs.unobserve(lazyImg);
                }
            });
        }, {
            rootMargin: '100px'
        });
        observer.observe(img);
    } else {
        img.src = img.dataset.src;
    }
    
    // NEW badge
    if (isNewImage(image)) {
        var newBadge = document.createElement('div');
        newBadge.className = 'new-badge';
        newBadge.textContent = 'NEW';
        item.appendChild(newBadge);
    }
    
    item.addEventListener('click', function() {
        openLightbox(image);
    });
    
    item.appendChild(img);
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

function openLightbox(image) {
    currentLightboxImage = image;
    currentLightboxIndex = currentLightboxImages.findIndex(function(img) { return img.id === image.id; });
    
    var lightbox = document.querySelector('.lightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        document.body.appendChild(lightbox);
    }
    
    var currentNum = currentLightboxIndex + 1;
    var totalNum = currentLightboxImages.length;
    
    lightbox.innerHTML = 
        '<button class="lightbox-close-btn" aria-label="關閉">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line>' +
        '<line x1="6" y1="6" x2="18" y2="18"></line>' +
        '</svg>' +
        '</button>' +
        '<div class="lightbox-slide-indicator">' + currentNum + ' / ' + totalNum + '</div>' +
        '<img src="" alt="' + image.name + '" class="lightbox-img">';
    
    var lightboxImg = lightbox.querySelector('.lightbox-img');
    lightboxImg.src = getFullSizeUrl(image.id);
    
    lightbox.classList.add('active');
    
    var closeBtn = lightbox.querySelector('.lightbox-close-btn');
    closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeLightbox();
    });
    
    lightboxImg.addEventListener('click', function(e) {
        e.stopPropagation();
        nextLightboxImage();
    });
    
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
}

// ========================================
// Display Images (Main Gallery Render)
// ========================================
function displayImages(images) {
    var gallery = document.getElementById('gallery');
    removeSkeleton();
    gallery.innerHTML = '';
    
    if (images.length === 0) {
        gallery.innerHTML = '<div class="no-likes-message"><p>沒有照片</p></div>';
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
    
    displayOrder.forEach(function(image) {
        var item = createGalleryItem(image);
        gallery.appendChild(item);
    });
}


// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    setupNavigation();
    loadImages();
    
    // Floating new filter button (mobile)
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
        if (e.key === 'Escape') {
            closeLightbox();
        }
    });
});
