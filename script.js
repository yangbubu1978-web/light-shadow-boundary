// ========================================
// The Light-Shadow Boundary - Gallery Script
// ========================================

// Firebase Configuration - loaded from external file
let database = null;
let firebaseReady = false;

// Google Drive API Configuration
const GOOGLE_DRIVE_API_KEY = 'AIzaSyAo4AIfSUyoXSPFzqyuRKItGvPQDJh6iIU';
const DRIVE_FOLDER_ID = '1_hW6kUof0k79p4GWrcIeWFBLlCghGPUE';


// Image list
let allImages = [];
let likesData = {};
let userLikes = [];
let visitorId = '';
let showOnlyLiked = false;

// ========================================
// Firebase Initialization
// ========================================
function loadFirebaseConfig() {
    return new Promise(function(resolve, reject) {
        if (typeof firebaseConfig !== 'undefined' && firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
            firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            firebaseReady = true;
            resolve();
        } else {
            var script = document.createElement('script');
            script.src = 'firebase-config.js';
            script.onload = function() {
                if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
                    firebase.initializeApp(firebaseConfig);
                    database = firebase.database();
                    firebaseReady = true;
                    resolve();
                } else {
                    firebaseReady = false;
                    resolve();
                }
            };
            script.onerror = function() { 
                firebaseReady = false;
                resolve();
            };
            document.head.appendChild(script);
        }
    });
}

function getVisitorId() {
    var id = localStorage.getItem('visitorId');
    if (!id) {
        id = 'visitor_' + Math.random().toString(36).substr(2, 9) + Date.now();
        localStorage.setItem('visitorId', id);
    }
    return id;
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
            fields: 'files(id, name, mimeType),nextPageToken',
            pageSize: 1200,
            key: GOOGLE_DRIVE_API_KEY,
            supportsAllDrives: true,
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
            console.error('抓取檔案失敗: ' + response.status);
            break;
        }
        
        var data = await response.json();
        var files = data.files || [];
        
        for (var i = 0; i < files.length; i++) {
            accumulatedFiles.push({
                id: files[i].id,
                name: files[i].name || 'Untitled'
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
            fields: 'files(id, name),nextPageToken',
            pageSize: 1200,
            key: GOOGLE_DRIVE_API_KEY,
            supportsAllDrives: true,
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
            await getFilesRecursive(subfolders[j].id, accumulatedFiles);
        }
        
    } while (subfoldersToken);
}

// Firebase Functions
// ========================================
async function loadLikesData() {
    if (!firebaseReady || !database) return;
    try {
        var snapshot = await database.ref('likes').once('value');
        if (snapshot.exists()) {
            likesData = snapshot.val();
        }
        // Don't call updateLikesBadges() here - gallery items don't exist yet!
        // updateLikesBadges() will be called after displayImages() in loadImages()
    } catch (error) {
        console.error('Error loading likes:', error);
    }
}

async function loadUserLikes() {
    if (!firebaseReady || !database) return;
    try {
        var snapshot = await database.ref('userLikes/' + visitorId).once('value');
        if (snapshot.exists()) {
            userLikes = Object.keys(snapshot.val());
        }
    } catch (error) {
        console.error('Error loading user likes:', error);
    }
}

async function toggleLike(imageId) {
    if (!firebaseReady || !database) return;
    var isLiked = userLikes.includes(imageId);
    var likeRef = database.ref('likes/' + imageId);
    var userLikeRef = database.ref('userLikes/' + visitorId + '/' + imageId);
    
    try {
        if (isLiked) {
            await likeRef.transaction(function(current) { return Math.max(0, (current || 1) - 1); });
            await userLikeRef.remove();
            userLikes = userLikes.filter(function(id) { return id !== imageId; });
        } else {
            await likeRef.transaction(function(current) { return (current || 0) + 1; });
            await userLikeRef.set(true);
            userLikes.push(imageId);
        }
        
        var currentLikes = likesData[imageId] || 0;
        likesData[imageId] = isLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
        updateLikesBadges();
        updateLightboxLikeButton(imageId);
        updateHeartFilterCount();
        
        var lightboxLikeCount = document.querySelector('.lightbox-actions .like-count');
        if (lightboxLikeCount) {
            lightboxLikeCount.textContent = likesData[imageId] || 0;
        }
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

function updateLikesBadges() {
    document.querySelectorAll('.gallery-item').forEach(function(item) {
        var imageId = item.dataset.imageId;
        var badge = item.querySelector('.like-badge');
        var count = likesData[imageId] || 0;
        
        if (badge) {
            var countSpan = badge.querySelector('.count');
            if (countSpan) {
                countSpan.textContent = count;
            }
            if (count > 0) {
                badge.classList.add('has-likes');
            } else {
                badge.classList.remove('has-likes');
            }
        }
    });
}

function updateHeartFilterCount() {
    // Calculate total likes across ALL photos from ALL visitors
    var totalLikes = Object.values(likesData).reduce(function(sum, count) { return sum + count; }, 0);
    
    // Update desktop nav button
    var countSpan = document.querySelector('.heart-filter-btn .filter-count');
    if (countSpan) {
        countSpan.textContent = totalLikes > 0 ? totalLikes : '';
    }
    
    // Update floating mobile button
    var floatingCountSpan = document.querySelector('.floating-heart-filter .floating-filter-count');
    if (floatingCountSpan) {
        floatingCountSpan.textContent = totalLikes > 0 ? totalLikes : '';
    }
}

function updateLightboxLikeButton(imageId) {
    var likeBtn = document.querySelector('.lightbox-actions .like-btn');
    if (likeBtn) {
        if (userLikes.includes(imageId)) {
            likeBtn.classList.add('liked');
        } else {
            likeBtn.classList.remove('liked');
        }
    }
}

// ========================================
// Image URL Functions
// ========================================
function getThumbnailUrl(fileId, width) {
    width = width || 800;
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w' + width;
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

function sortByLikes(images) {
    return images.slice().sort(function(a, b) {
        var likesA = likesData[a.id] || 0;
        var likesB = likesData[b.id] || 0;
        return likesB - likesA;
    });
}

function filterLiked(images) {
    return images.filter(function(img) { return userLikes.includes(img.id); });
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
    img.loading = 'lazy';
    
    img.onload = function() {
        img.classList.add('loaded');
    };
    
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries, obs) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var lazyImg = entry.target;
                    lazyImg.src = lazyImg.dataset.src;
                    obs.unobserve(lazyImg);
                }
            });
        });
        observer.observe(img);
    } else {
        img.src = img.dataset.src;
    }
    
    var badge = document.createElement('div');
    badge.className = 'like-badge';
    badge.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><span class="count">' + (likesData[image.id] || 0) + '</span>';
    
    item.addEventListener('click', function() {
        openLightbox(image);
    });
    
    item.appendChild(img);
    item.appendChild(badge);
    return item;
}

function showSkeleton(count) {
    count = count || 18;
    var gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div class="skeleton-container">';
    var container = gallery.querySelector('.skeleton-container');
    
    for (var i = 0; i < count; i++) {
        var skeleton = document.createElement('div');
        skeleton.className = 'skeleton-item';
        container.appendChild(skeleton);
    }
    
    var text = document.createElement('p');
    text.className = 'skeleton-text';
    text.textContent = '載入作品中...';
    gallery.appendChild(text);
}

function removeSkeleton() {
    var gallery = document.getElementById('gallery');
    var skeleton = gallery.querySelector('.skeleton-container');
    var skeletonText = gallery.querySelector('.skeleton-text');
    if (skeleton) skeleton.remove();
    if (skeletonText) skeletonText.remove();
}

function displayImages(images) {
    var gallery = document.getElementById('gallery');
    removeSkeleton();
    gallery.innerHTML = '';
    
    if (images.length === 0) {
        gallery.innerHTML = '<div class="no-likes-message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><p>還沒有喜愛的照片</p></div>';
        currentLightboxImages = [];
        return;
    }
    
    var displayImages = showOnlyLiked ? sortByLikes(images) : shuffleArray(images);
    
    // Store current displayed images for lightbox navigation
    currentLightboxImages = displayImages.slice();
    
    displayImages.forEach(function(image) {
        var item = createGalleryItem(image);
        gallery.appendChild(item);
    });
}

// ========================================
// Lightbox Functions
// ========================================
var currentLightboxImage = null;
var currentLightboxIndex = -1;
var currentLightboxImages = []; // Track which images are currently displayed

function openLightbox(image) {
    currentLightboxImage = image;
    currentLightboxIndex = currentLightboxImages.findIndex(function(img) { return img.id === image.id; });
    
    var lightbox = document.querySelector('.lightbox');
    
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        document.body.appendChild(lightbox);
    }
    
    var isLiked = userLikes.includes(image.id);
    var likeCount = likesData[image.id] || 0;
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
        '<img src="" alt="' + image.name + '" class="lightbox-img">' +
        '<div class="lightbox-actions">' +
        '<button class="like-btn ' + (isLiked ? 'liked' : '') + '" data-image-id="' + image.id + '">' +
        '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' +
        '</button>' +
        '<span class="like-count">' + likeCount + '</span>' +
        '</div>';
    
    var lightboxImg = lightbox.querySelector('.lightbox-img');
    lightboxImg.src = getFullSizeUrl(image.id);
    
    lightbox.classList.add('active');
    
    // Close button handler
    var closeBtn = lightbox.querySelector('.lightbox-close-btn');
    closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeLightbox();
    });
    
    // Like button handler
    var likeBtn = lightbox.querySelector('.like-btn');
    likeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleLike(image.id);
    });
    
    // Image click - go to next photo
    lightboxImg.addEventListener('click', function(e) {
        e.stopPropagation();
        showNextImage();
    });
    
    // Backdrop click - close
    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
}

function showNextImage() {
    if (currentLightboxIndex === -1 || currentLightboxImages.length === 0) return;
    
    // Cycle to next image
    currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxImages.length;
    var nextImage = currentLightboxImages[currentLightboxIndex];
    
    if (!nextImage) return;
    
    currentLightboxImage = nextImage;
    var lightbox = document.querySelector('.lightbox');
    if (!lightbox) return;
    
    var lightboxImg = lightbox.querySelector('.lightbox-img');
    var isLiked = userLikes.includes(nextImage.id);
    var likeCount = likesData[nextImage.id] || 0;
    var currentNum = currentLightboxIndex + 1;
    var totalNum = currentLightboxImages.length;
    
    // Update image
    lightboxImg.src = getFullSizeUrl(nextImage.id);
    lightboxImg.alt = nextImage.name;
    
    // Update like button
    var likeBtn = lightbox.querySelector('.like-btn');
    if (likeBtn) {
        if (isLiked) {
            likeBtn.classList.add('liked');
        } else {
            likeBtn.classList.remove('liked');
        }
        likeBtn.dataset.imageId = nextImage.id;
    }
    
    // Update like count
    var likeCountEl = lightbox.querySelector('.like-count');
    if (likeCountEl) {
        likeCountEl.textContent = likeCount;
    }
    
    // Update slide indicator
    var indicator = lightbox.querySelector('.lightbox-slide-indicator');
    if (indicator) {
        indicator.textContent = currentNum + ' / ' + totalNum;
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
// Filter Toggle
// ========================================
function toggleHeartFilter() {
    showOnlyLiked = !showOnlyLiked;
    var btn = document.querySelector('.nav-links .heart-filter-btn');
    var floatingBtn = document.getElementById('floating-heart-filter');
    
    if (showOnlyLiked) {
        // Show all photos sorted by likes (most liked first)
        btn.classList.add('active');
        if (floatingBtn) floatingBtn.classList.add('active');
        displayImages(sortByLikes(allImages));
        // Scroll to top to show the most liked photo (use scrollIntoView for better mobile compatibility)
        document.getElementById('portfolio')?.scrollIntoView({ top: 0, behavior: 'smooth' });
    } else {
        // Show shuffled (random order)
        btn.classList.remove('active');
        if (floatingBtn) floatingBtn.classList.remove('active');
        displayImages(shuffleArray(allImages));
    }
}

// ========================================
// Navigation Setup
// ========================================
function setupNavigation() {
    var navLinks = document.querySelector('.nav-links');
    
    var heartBtn = document.createElement('button');
    heartBtn.className = 'heart-filter-btn';
    heartBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><span class="filter-count"></span>';
    heartBtn.addEventListener('click', toggleHeartFilter);
    
    navLinks.appendChild(heartBtn);
}

// ========================================
// Load Images - Google Drive API 優先
// ========================================
async function loadImages() {
    showSkeleton(18);
    
    try {
        await loadFirebaseConfig();
        visitorId = getVisitorId();
        
        await Promise.all([loadLikesData(), loadUserLikes()]);
        
        // Try images.json first (fast, same domain)
        allImages = [];
        try {
            var response = await fetch('images.json');
            if (response.ok) {
                var data = await response.json();
                allImages = data.images || [];
                console.log('images.json loaded', allImages.length, 'images');
            } else {
                console.log('images.json failed, trying Google Drive API...');
                allImages = await fetchImagesFromDrive();
            }
        } catch (e) {
            console.log('images.json failed:', e.message, '- trying Google Drive API...');
            try {
                allImages = await fetchImagesFromDrive();
                console.log('Google Drive API returned', allImages.length, 'images');
            } catch (e2) {
                console.log('Google Drive API also failed:', e2);
                allImages = getDefaultImages();
            }
        }
        
        if (allImages.length === 0) {
            allImages = getDefaultImages();
        }
        
        displayImages(allImages);
        updateLikesBadges();
        updateHeartFilterCount();
        
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
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    setupNavigation();
    loadImages();
    
    // Floating heart filter button (mobile)
    var floatingHeartBtn = document.getElementById('floating-heart-filter');
    if (floatingHeartBtn) {
        floatingHeartBtn.addEventListener('click', function() {
            toggleHeartFilter();
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
