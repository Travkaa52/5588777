/**
 * TACTICAL MONITOR CORE v3.5 - FINAL REVISION
 * Features: JSON Sync, Custom Icons, Geolocation, Distance Alerts, Push Notifications
 */

const State = {
    targets: [],
    markers: new Map(),     // Зберігаємо маркери цілей: ID -> Leaflet Marker
    userCoords: null,       // Координати телефону
    alertRadius: 50,        // Радіус безпеки в км
    activePage: 'map',
    notifiedIds: new Set(), // Реєстр відправлених сповіщень
    
    save() {
        localStorage.setItem('hud_state_v3', JSON.stringify({ 
            alertRadius: this.alertRadius 
        }));
    },
    
    load() {
        const saved = localStorage.getItem('hud_state_v3');
        if (saved) {
            const data = JSON.parse(saved);
            this.alertRadius = data.alertRadius || 50;
            const input = document.getElementById('alert-radius');
            if (input) input.value = this.alertRadius;
        }
    }
};

// --- ДОПОМІЖНІ ФУНКЦІЇ ---

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// --- ОСНОВНИЙ ОБ'ЄКТ UI ---

const ui = {
    map: null,
    userMarker: null,
    ICON_PATH: 'img/', // Папка з вашими png

    init() {
        // Карта
        this.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([49.0, 31.0], 6);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(this.map);

        // Геолокація
        this.initGeolocation();
        
        // Дозвіл на сповіщення
        if ("Notification" in window) Notification.requestPermission();

        // Слухач радіуса
        document.getElementById('alert-radius')?.addEventListener('change', (e) => {
            State.alertRadius = parseFloat(e.target.value) || 50;
            State.save();
            State.notifiedIds.clear(); // Дозволяємо перевірити цілі за новим радіусом
            this.notify(`РАДІУС ОНОВЛЕНО: ${State.alertRadius} КМ`, "info");
        });
    },

    initGeolocation() {
        if (!("geolocation" in navigator)) return;
        navigator.geolocation.watchPosition(
            (pos) => {
                State.userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                this.updateUserMarker();
            },
            (err) => console.error("GPS Error:", err),
            { enableHighAccuracy: true }
        );
    },

    updateUserMarker() {
        if (!State.userCoords) return;
        const coords = [State.userCoords.lat, State.userCoords.lng];
        if (this.userMarker) {
            this.userMarker.setLatLng(coords);
        } else {
            this.userMarker = L.circleMarker(coords, {
                radius: 8, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.8
            }).addTo(this.map).bindPopup("ВАША ПОЗИЦІЯ");
        }
    },

    updateMarkers() {
        const currentIds = new Set(State.targets.map(t => String(t.id)));

        // Видалення втрачених цілей
        State.markers.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                this.map.removeLayer(marker);
                State.markers.delete(id);
                this.notify(`ОБ'ЄКТ ${id} ЗНИК`, "warning");
            }
        });

        // Оновлення/Створення маркерів з іконками
        State.targets.forEach(t => {
            const id = String(t.id);
            const iconUrl = `${this.ICON_PATH}${t.type}.png`;
            
            const customIcon = L.icon({
                iconUrl: iconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16],
                className: (t.type === 'missile' || t.type === 'kab') ? 'threat-pulse' : ''
            });

            if (State.markers.has(id)) {
                const m = State.markers.get(id);
                m.setLatLng([t.lat, t.lng]);
                m.setIcon(customIcon);
            } else {
                const m = L.marker([t.lat, t.lng], { icon: customIcon }).addTo(this.map);
                m.bindPopup(`<b>${t.label}</b>`);
                State.markers.set(id, m);
            }
        });
    },

    renderTargetsList() {
        const container = document.getElementById('targets-container');
        if (!container) return;

        container.innerHTML = State.targets.map(t => {
            const iconUrl = `${this.ICON_PATH}${t.type}.png`;
            const dist = State.userCoords ? 
                getDistance(State.userCoords.lat, State.userCoords.lng, t.lat, t.lng).toFixed(1) : '--';

            return `
                <div class="glass p-3 rounded-lg flex items-center gap-3 border-l-4 ${t.type === 'missile' ? 'border-red-600' : 'border-orange-500'} active:scale-95 transition-transform" 
                     onclick="ui.focusTarget(${t.lat}, ${t.lng})">
                    <div class="w-10 h-10 flex-shrink-0 bg-black/40 rounded flex items-center justify-center border border-white/10">
                        <img src="${iconUrl}" class="w-8 h-8 object-contain" onerror="this.src='${this.ICON_PATH}default.png'">
                    </div>
                    <div class="flex-grow overflow-hidden text-left">
                        <h4 class="font-bold text-[11px] truncate uppercase text-orange-400">${t.label}</h4>
                        <p class="text-[10px] opacity-60 font-mono">DIST: ${dist} KM | ${t.id}</p>
                    </div>
                    <div class="text-right font-mono text-[10px] text-orange-500">
                        ${t.lat.toFixed(2)}<br>${t.lng.toFixed(2)}
                    </div>
                </div>
            `;
        }).join('');
    },

    checkThreats() {
        if (!State.userCoords) return;

        State.targets.forEach(t => {
            const distance = getDistance(State.userCoords.lat, State.userCoords.lng, t.lat, t.lng);
            if (distance <= State.alertRadius) {
                if (!State.notifiedIds.has(t.id)) {
                    this.sendPush(t, distance);
                    State.notifiedIds.add(t.id);
                }
            } else {
                State.notifiedIds.delete(t.id);
            }
        });
    },

    sendPush(target, dist) {
        const msg = `Ціль: ${target.label} | Дистанція: ${dist.toFixed(1)} км`;
        this.notify(`УВАГА! ЗОНА УРАЖЕННЯ: ${dist.toFixed(1)} км`, "danger");

        if (Notification.permission === "granted") {
            new Notification("⚠️ ТАКТИЧНА ЗАГРОЗА", {
                body: msg,
                icon: `${this.ICON_PATH}${target.type}.png`,
                vibrate: [300, 100, 300]
            });
        }
    },

    focusTarget(lat, lng) {
        router.go('map');
        setTimeout(() => this.map.flyTo([lat, lng], 10, { duration: 1.5 }), 300);
    },

    notify(text, type) {
        const log = document.getElementById('logs-container');
        if (!log) return;
        const entry = document.createElement('div');
        const color = type === 'danger' ? 'border-red-600' : (type === 'warning' ? 'border-yellow-600' : 'border-blue-600');
        entry.className = `p-2 border-l-2 ${color} bg-white/5 mb-1 text-[10px] font-mono`;
        entry.innerHTML = `<span class="opacity-40">[${new Date().toLocaleTimeString()}]</span> ${text}`;
        log.prepend(entry);
        if (log.children.length > 30) log.lastChild.remove();
    }
};

// --- СИСТЕМА ПАРСИНГУ ---

const Parser = {
    async fetchData() {
        try {
            const response = await fetch(`targets.json?nocache=${Date.now()}`);
            if (!response.ok) throw new Error("Link Lost");
            return await response.json();
        } catch (e) {
            ui.notify("ПОМИЛКА СИНХРОНІЗАЦІЇ", "danger");
            return null;
        }
    }
};

// --- РОУТЕР ТА ЦИКЛ ---

const router = {
    go(pageId) {
        if (State.activePage === pageId) return;
        const oldP = `#page-${State.activePage}`, newP = `#page-${pageId}`;
        gsap.to(oldP, { x: -20, opacity: 0, duration: 0.2, onComplete: () => {
            document.querySelector(oldP).classList.remove('active');
            document.querySelector(newP).classList.add('active');
            gsap.fromTo(newP, { x: 20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3 });
            if (pageId === 'map') ui.map.invalidateSize();
        }});
        State.activePage = pageId;
        this.updateNav();
    },
    updateNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isAct = btn.dataset.page === State.activePage;
            btn.style.opacity = isAct ? "1" : "0.5";
            btn.style.color = isAct ? "#f97316" : "#a8a29e";
        });
    }
};

async function engine() {
    const data = await Parser.fetchData();
    if (data) {
        State.targets = data;
        ui.updateMarkers();
        ui.renderTargetsList();
        ui.checkThreats();
        const cnt = document.getElementById('obj-count');
        if (cnt) cnt.innerText = data.length;
    }
}

window.onload = () => {
    State.load();
    ui.init();
    router.updateNav();
    setInterval(() => {
        const c = document.getElementById('clock');
        if (c) c.innerText = new Date().toLocaleTimeString('uk-UA');
    }, 1000);
    engine();
    setInterval(engine, 5000);
};
