import { HexagonBackground } from './components/HexagonBackground.js';

class App {
    constructor() {
        this.init();
    }

    init() {
        // Initialize Preloader
        this.initPreloader();

        // Initialize Background
        new HexagonBackground('hexa-bg');

        // Initialize Mobile Menu
        this.initMobileMenu();

        // Smooth Scroll for Anchor Links
        this.initSmoothScroll();

        // Özel imleç kaldırıldı — e-ticarette sistem imleci beklenir.

        // Initialize Scroll Animations
        this.initScrollAnimations();

        // Initialize Sticky Header
        this.initStickyHeader();

        // Initialize Form Validation (if on contact page)
        this.initFormValidation();

        // Initialize Back to Top
        this.initBackToTop();

        // Initialize Counter Animation
        this.initCounterAnimation();
    }

    initCounterAnimation() {
        const counters = document.querySelectorAll('.counter');
        if (counters.length === 0) return;

        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.5
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counter = entry.target;
                    const target = +counter.getAttribute('data-target');
                    const suffix = counter.getAttribute('data-suffix') || '';
                    const duration = 3000; // 3 seconds
                    const increment = target / (duration / 16); // 60fps

                    let current = 0;
                    const updateCounter = () => {
                        current += increment;
                        if (current < target) {
                            counter.innerText = Math.ceil(current) + suffix;
                            requestAnimationFrame(updateCounter);
                        } else {
                            counter.innerText = target + suffix;
                        }
                    };

                    updateCounter();
                    observer.unobserve(counter);
                }
            });
        }, observerOptions);

        counters.forEach(counter => {
            observer.observe(counter);
        });
    }

    initMobileMenu() {
        const btn = document.querySelector('.mobile-menu-btn');
        const nav = document.querySelector('.nav');

        if (btn && nav) {
            btn.addEventListener('click', () => {
                nav.classList.toggle('active');
                // Optional: Animate hamburger to X
            });

            // Close menu when clicking a link
            nav.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    nav.classList.remove('active');
                });
            });
        }
    }

    initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    const headerOffset = 80;
                    const elementPosition = targetElement.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });
                }
            });
        });
    }

    initScrollAnimations() {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    observer.unobserve(entry.target); // Only animate once
                }
            });
        }, observerOptions);

        document.querySelectorAll('.reveal').forEach(el => {
            observer.observe(el);
        });
    }

    initStickyHeader() {
        const header = document.querySelector('.header');
        if (header) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 50) {
                    header.style.background = 'rgba(14, 17, 13, 0.95)';
                    header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
                } else {
                    header.style.background = 'rgba(14, 17, 13, 0.8)';
                    header.style.boxShadow = 'none';
                }
            });
        }
    }

    initFormValidation() {
        const form = document.querySelector('.contact-form');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            let isValid = true;

            // Simple validation
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                const parent = input.parentElement;
                // Remove existing error
                input.classList.remove('error');
                parent.classList.remove('has-error');
                const existingMsg = parent.querySelector('.error-message');
                if (existingMsg) existingMsg.remove();

                if (!input.value.trim()) {
                    isValid = false;
                    input.classList.add('error');
                    parent.classList.add('has-error');
                    
                    const msg = document.createElement('div');
                    msg.className = 'error-message';
                    msg.innerText = 'Bu alan zorunludur.';
                    parent.appendChild(msg);
                }
            });

            if (isValid) {
                // Simulate sending
                const btn = form.querySelector('button[type="submit"]');
                const originalText = btn.innerText;
                btn.innerText = 'Gönderiliyor...';
                btn.disabled = true;

                setTimeout(() => {
                    btn.innerText = 'Gönderildi!';
                    btn.style.backgroundColor = 'var(--color-primary)';
                    btn.style.color = 'var(--color-bg)';
                    form.reset();
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.disabled = false;
                    }, 3000);
                }, 1500);
            }
        });
    }

    initPreloader() {
        // Create Preloader HTML if not exists
        if (!document.querySelector('.preloader')) {
            const preloader = document.createElement('div');
            preloader.className = 'preloader';
            preloader.innerHTML = `
                <div class="skeleton-header">
                    <div class="skeleton-inner">
                        <div class="skeleton-logo"></div>
                        <div class="skeleton-nav">
                            <div class="skeleton-nav-item"></div>
                            <div class="skeleton-nav-item"></div>
                            <div class="skeleton-nav-item"></div>
                            <div class="skeleton-nav-item"></div>
                        </div>
                    </div>
                </div>
                <div class="skeleton-hero">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text" style="width: 30%"></div>
                </div>
            `;
            document.body.prepend(preloader);
        }

        const preloader = document.querySelector('.preloader');
        if (preloader) {
            // If window is already loaded
            if (document.readyState === 'complete') {
                setTimeout(() => {
                    preloader.classList.add('fade-out');
                    setTimeout(() => {
                        preloader.remove();
                    }, 500);
                }, 500);
            } else {
                window.addEventListener('load', () => {
                    setTimeout(() => {
                        preloader.classList.add('fade-out');
                        setTimeout(() => {
                            preloader.remove();
                        }, 500);
                    }, 500);
                });
            }
        }
    }

    initBackToTop() {
        const btn = document.createElement('button');
        btn.className = 'back-to-top';
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
        btn.setAttribute('aria-label', 'Yukarı Çık');
        document.body.appendChild(btn);

        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        });

        btn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
});