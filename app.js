/**
 * TACTICAL MONITOR CORE v3.2
 * Повна інтеграція з файлом targets.json та обробка видалення об'єктів
 */

const State = {
    targets: [],
    markers: new Map(), // Зберігаємо маркери: ID => Leaflet Marker
    activePage: 'map',
    panicMode: false,
    
    save() {
        localStorage.setItem('hud_state', JSON.stringify({ panicMode: this.panicMode }));
    },
    
    load() {
        const saved = localStorage.getItem('hud_state');
        if (saved) Object.assign(this, JSON.parse(saved));
    }
};

const Parser = {
    // Шлях до вашого файлу. Якщо файл у тій же папці, що й index.html, просто 'targets.json'
    FILE_URL: 'targets.json', 

    async fetchData() {
        try {
            // Додаємо мітку часу, щоб браузер не кешував файл і завжди брав свіжі дані
            const response = await fetch(`${this.FILE_URL}?nocache=${Date.now()}`);
            
            if (!response.ok) {
                throw new Error(`Помилка мережі: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (e) {
            console.error("Parser Error:", e);
            ui.notify("ПОМИЛКА ЗЧИТУВАННЯ ТАБЛИЦІ ЦІЛЕЙ", "danger");
            return null;
        }
    }
};

const router = {
    go(pageId) {
        if (State.activePage === pageId) return;

        const oldPage = `#page-${State.activePage}`;
        const newPage = `#page-${pageId}`;
        
        gsap.to(oldPage, { 
            x: -20, opacity: 0, duration: 0.2, 
            onComplete: () => {
                document.querySelector(oldPage).classList.remove('active');
                const next = document.querySelector(newPage);
                next.classList.add('active');
                gsap.fromTo(newPage, { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3 });
                
                // Оновлюємо карту, щоб уникнути багів з розміром при перемиканні вкладок
                if (pageId === 'map' && ui.map) ui.map.invalidateSize();
            }
        });

        State.activePage = pageId;
        this.updateNav();
    },

    updateNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.dataset.page === State.activePage;
            btn.style.opacity = isActive ? "1" : "0.5";
            btn.style.color = isActive ? "#f97316" : "#a8a29e";
        });
    }
};

const ui = {
    map: null,

    initMap() {
        this.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([49.0, 31.0], 6);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(this.map);
    },

    updateMarkers() {
        // Створюємо список ID, які прийшли у новому запиті
        const currentIds = new Set(State.targets.map(t => String(t.id)));

        // 1. Видаляємо з карти ті цілі, яких більше немає у файлі targets.json
        State.markers.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                this.map.removeLayer(marker);
                State.markers.delete(id);
                this.notify(`ОБ'ЄКТ ${id} ЗНИК З РАДАРІВ`, "warning");
            }
        });

        // 2. Додаємо нові або оновлюємо існуючі координати
        State.targets.forEach(t => {
            const id = String(t.id);
            const coords = [t.lat, t.lng];

            if (State.markers.has(id)) {
                // Плавне переміщення існуючого маркера
                State.markers.get(id).setLatLng(coords);
            } else {
                // Створення нового маркера
                const color = t.type === 'missile' ? '#dc2626' : '#f97316';
                const icon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="w-4 h-4 rounded-full ${t.type === 'missile' ? 'bg-red-600 animate-ping' : 'bg-orange-500'} border-2 border-white shadow-[0_0_15px_${color}]"></div>`,
                    iconSize: [16, 16]
                });

                const m = L.marker(coords, { icon }).addTo(this.map);
                m.on('click', () => this.showModal("ІДЕНТИФІКАЦІЯ ЦІЛІ", `<b>${t.label}</b><br>ID: ${t.id}<br>ТИП: ${t.type.toUpperCase()}`));
                State.markers.set(id, m);
                
                this.notify(`ВИЯВЛЕНО НОВУ ЦІЛЬ: ${t.label}`, t.type === 'missile' ? 'danger' : 'info');
            }
        });
    },

    renderTargetsList() {
        const container = document.getElementById('targets-container');
        if (!container) return;

        container.innerHTML = State.targets.map(t => `
            <div class="glass p-4 rounded-lg flex justify-between items-center border-l-4 ${t.type === 'missile' ? 'border-red-600' : 'border-orange-500'} active:scale-95 transition-transform" 
                 onclick="ui.focusTarget(${t.lat}, ${t.lng})">
                <div class="pointer-events-none">
                    <h4 class="font-bold text-sm tracking-tight">${t.label}</h4>
                    <p class="text-[10px] opacity-50 font-mono">${t.id} | ${new Date(t.time).toLocaleTimeString('uk-UA')}</p>
                </div>
                <div class="text-right pointer-events-none font-mono">
                    <span class="text-[10px] text-orange-500">${t.lat.toFixed(3)}, ${t.lng.toFixed(3)}</span>
                </div>
            </div>
        `).join('');
    },

    focusTarget(lat, lng) {
        router.go('map');
        setTimeout(() => {
            this.map.flyTo([lat, lng], 10, { duration: 1.5 });
        }, 300);
    },

    notify(text, type) {
        const log = document.getElementById('logs-container');
        if (!log) return;
        const entry = document.createElement('div');
        const borderColor = type === 'danger' ? 'border-red-600' : (type === 'warning' ? 'border-yellow-600' : 'border-blue-600');
        
        entry.className = `p-2 border-l-2 ${borderColor} bg-white/5 mb-1 text-[10px] font-mono`;
        entry.innerHTML = `<span class="opacity-40">[${new Date().toLocaleTimeString()}]</span> ${text}`;
        
        log.prepend(entry);
        if (log.children.length > 30) log.lastChild.remove();
    },

    showModal(title, body) {
        const m = document.getElementById('modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-body').innerHTML = body;
        m.style.opacity = "1";
        m.classList.remove('pointer-events-none');
    }
};

// Головний цикл оновлення
async function engine() {
    const data = await Parser.fetchData();
    if (data) {
        State.targets = data;
        ui.updateMarkers();
        ui.renderTargetsList();
        
        const counter = document.getElementById('obj-count');
        if (counter) counter.innerText = data.length;
    }
}

function init() {
    State.load();
    ui.initMap();
    router.updateNav();
    
    // Оновлення годинника
    setInterval(() => {
        const clock = document.getElementById('clock');
        if (clock) clock.innerText = new Date().toLocaleTimeString('uk-UA');
    }, 1000);

    // Перший запуск та інтервал (кожні 5 секунд)
    engine();
    setInterval(engine, 5000);
}

window.onload = init;
