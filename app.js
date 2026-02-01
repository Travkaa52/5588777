/**
 * TACTICAL MONITOR CORE v3.0
 * Architecture: Modular Vanilla JS with GSAP Animations
 */

// 1. State Management
const State = {
    targets: [],
    logs: [],
    activePage: 'map',
    lastSync: null,
    panicMode: false,
    
    // Сохранение состояния
    save() {
        localStorage.setItem('hud_state', JSON.stringify({
            panicMode: this.panicMode
        }));
    },
    
    load() {
        const saved = localStorage.getItem('hud_state');
        if (saved) Object.assign(this, JSON.parse(saved));
    }
};

// 2. API / Parser Module
const Parser = {
    URL: 'https://MY_PARSER_API_URL/data.json', // Замените на реальный
    
    async fetchData() {
        try {
            // Имитация данных если URL пустой
            if (this.URL.includes('MY_PARSER')) return this.mockData();
            
            const res = await fetch(this.URL + '?t=' + Date.now());
            if (!res.ok) throw new Error("Link Lost");
            return await res.json();
        } catch (e) {
            ui.notify("SYNC_ERROR: RECONNECTING...", "danger");
            return null;
        }
    },

    mockData() {
        return [
            { id: 1, lat: 49.99, lng: 36.23, type: 'drone', label: 'SHAHEED-136', time: new Date().toISOString() },
            { id: 2, lat: 50.45, lng: 30.52, type: 'missile', label: 'KH-101', time: new Date().toISOString() }
        ];
    }
};

// 3. Router & Transitions
const router = {
    go(pageId) {
        if (State.activePage === pageId) return;

        const oldPage = `#page-${State.activePage}`;
        const newPage = `#page-${pageId}`;
        
        // GSAP Transition
        gsap.to(oldPage, { 
            x: -20, 
            opacity: 0, 
            duration: 0.3, 
            onComplete: () => {
                document.querySelector(oldPage).classList.remove('active');
                const next = document.querySelector(newPage);
                next.classList.add('active');
                gsap.fromTo(newPage, { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 });
            }
        });

        State.activePage = pageId;
        this.updateNav();
    },

    updateNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.dataset.page === State.activePage;
            btn.style.opacity = isActive ? "1" : "0.5";
            btn.style.color = isActive ? "#ff9d00" : "#a8a29e";
        });
    }
};

// 4. UI Components & Renderers
const ui = {
    map: null,
    markers: new Map(),

    initMap() {
        this.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([49.0, 31.0], 6);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(this.map);
    },

    renderTargets() {
        const container = document.getElementById('targets-container');
        container.innerHTML = State.targets.map(t => `
            <div class="glass p-4 rounded-lg flex justify-between items-center border-l-4 ${t.type === 'missile' ? 'border-red-600' : 'border-orange-500'}" 
                 onclick="ui.focusTarget(${t.lat}, ${t.lng})">
                <div>
                    <h4 class="font-bold text-sm">${t.label}</h4>
                    <p class="text-[10px] opacity-50">${t.type.toUpperCase()} | ${new Date(t.time).toLocaleTimeString()}</p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] font-mono text-orange-500">LOC: ${t.lat.toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    },

    updateMarkers() {
        State.targets.forEach(t => {
            if (this.markers.has(t.id)) {
                this.markers.get(t.id).setLatLng([t.lat, t.lng]);
            } else {
                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="w-4 h-4 rounded-full ${t.type === 'missile' ? 'bg-red-600 animate-ping' : 'bg-orange-500'} border-2 border-white shadow-[0_0_15px_rgba(255,157,0,0.8)]"></div>`,
                    iconSize: [16, 16]
                });
                const m = L.marker([t.lat, t.lng], { icon }).addTo(this.map);
                m.on('click', () => this.showModal("OBJECT_DETAILS", `ID: ${t.id}<br>TYPE: ${t.type}<br>POS: ${t.lat}, ${t.lng}`));
                this.markers.set(t.id, m);
            }
        });
    },

    focusTarget(lat, lng) {
        router.go('map');
        this.map.flyTo([lat, lng], 10, { duration: 2 });
    },

    showModal(title, body) {
        const m = document.getElementById('modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-body').innerHTML = body;
        m.classList.remove('pointer-events-none');
        m.classList.add('opacity-100');
        document.getElementById('modal-content').classList.remove('scale-90');
    },

    closeModal() {
        const m = document.getElementById('modal');
        m.classList.add('pointer-events-none');
        m.classList.remove('opacity-100');
        document.getElementById('modal-content').classList.add('scale-90');
    },

    notify(text, type) {
        const log = document.getElementById('logs-container');
        const entry = document.createElement('div');
        entry.className = `p-2 border-l-2 ${type === 'danger' ? 'border-red-500 text-red-400' : 'border-blue-500'} bg-white/5 mb-1 animate-pulse`;
        entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${text}`;
        log.prepend(entry);
    }
};

// 5. App Lifecycle
async function engine() {
    const data = await Parser.fetchData();
    if (data) {
        State.targets = data;
        ui.updateMarkers();
        ui.renderTargets();
        document.getElementById('obj-count').innerText = data.length;
    }
}

function init() {
    State.load();
    ui.initMap();
    router.updateNav();
    
    // Clock
    setInterval(() => {
        document.getElementById('clock').innerText = new Date().toLocaleTimeString('uk-UA');
    }, 1000);

    // Основной цикл синхронизации
    engine();
    setInterval(engine, 5000);

    // Регистрация PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }
}

window.onload = init;
