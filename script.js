// ========================================
// The Light-Shadow Boundary - Gallery Script
// ========================================

// Google Drive Folder Configuration
const FOLDER_ID = '1_hW6kUof0k79p4GWrcIeWFBLlCghGPUE';

// Image list from Google Drive folder
// This will be populated when page loads
let allImages = [];

// Shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Get thumbnail URL for Google Drive image
function getThumbnailUrl(fileId, width = 800) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}

// Get full-size URL for Google Drive image
function getFullSizeUrl(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// Create gallery item element
function createGalleryItem(image) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    
    const img = document.createElement('img');
    img.dataset.src = getThumbnailUrl(image.id);
    img.dataset.fullSrc = getFullSizeUrl(image.id);
    img.alt = image.name;
    img.loading = 'lazy';
    
    // Lazy loading with Intersection Observer
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const lazyImg = entry.target;
                    lazyImg.src = lazyImg.dataset.src;
                    obs.unobserve(lazyImg);
                }
            });
        });
        observer.observe(img);
    } else {
        img.src = img.dataset.src;
    }
    
    // Click to open lightbox
    item.addEventListener('click', () => {
        openLightbox(image);
    });
    
    item.appendChild(img);
    return item;
}

// Open lightbox with full-size image
function openLightbox(image) {
    let lightbox = document.querySelector('.lightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <span class="lightbox-close">&times;</span>
            <img src="" alt="">
        `;
        document.body.appendChild(lightbox);
        
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                closeLightbox();
            }
        });
    }
    
    const lightboxImg = lightbox.querySelector('img');
    lightboxImg.src = getFullSizeUrl(image.id);
    lightboxImg.alt = image.name;
    lightbox.classList.add('active');
}

function closeLightbox() {
    const lightbox = document.querySelector('.lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
    }
}

// Display images in gallery
function displayImages(images) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';
    
    // Shuffle and display
    const shuffledImages = shuffleArray(images);
    
    shuffledImages.forEach(image => {
        const item = createGalleryItem(image);
        gallery.appendChild(item);
    });
}

// Load images from page URL parameters or use default test images
async function loadImages() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<div class="loading">載入作品中...</div>';
    
    try {
        // For production: fetch from a JSON file or API
        // For now, we'll use a predefined list that matches the Google Drive folder
        // This will be updated when all photos are uploaded
        
        // Check if there's a images.json file
        try {
            const response = await fetch('images.json');
            if (response.ok) {
                const data = await response.json();
                allImages = data.images;
            } else {
                throw new Error('images.json not found');
            }
        } catch {
            // Use default test images (the 20 images from the folder)
            allImages = getDefaultImages();
        }
        
        displayImages(allImages);
        
    } catch (error) {
        console.error('Error loading images:', error);
        gallery.innerHTML = '<div class="loading">載入失敗，請刷新重試。</div>';
    }
}

// Default test images (the 20 images from the folder)
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadImages();
    
    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // Update active nav link on scroll
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-links a');
        
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (scrollY >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
    
    // Keyboard navigation for lightbox
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLightbox();
        }
    });
});
