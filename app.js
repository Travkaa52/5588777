/**
 * TACTICAL MONITOR CORE v3.4
 * Інтеграція: Геолокація, розрахунок дистанції та Push-сповіщення
 */

const State = {
    targets: [],
    markers: new Map(),
    userCoords: null,      // Координати користувача
    alertRadius: 50,       // Радіус за замовчуванням (км)
    activePage: 'map',
    notifiedIds: new Set(), // Щоб не надсилати сповіщення про одну ціль двічі
    
    save() {
        localStorage.setItem('hud_state', JSON.stringify({ 
            panicMode: this.panicMode,
            alertRadius: this.alertRadius 
        }));
    },
    
    load() {
        const saved = localStorage.getItem('hud_state');
        if (saved) {
            const data = JSON.parse(saved);
            Object.assign(this, data);
            // Оновлюємо значення в інпуті після завантаження
            const input = document.getElementById('alert-radius');
            if (input) input.value = this.alertRadius;
        }
    }
};

// Допоміжна функція розрахунку відстані (формула Гаверсину)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Радіус Землі в км
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

const ui = {
    map: null,
    userMarker: null,

    // ... (попередні методи initMap, router залишаються без змін)

    // Ініціалізація відстеження користувача
    initGeolocation() {
        if (!("geolocation" in navigator)) return;

        navigator.geolocation.watchPosition(
            (pos) => {
                State.userCoords = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                };
                this.updateUserMarker();
            },
            (err) => console.error("Помилка GPS:", err),
            { enableHighAccuracy: true }
        );
    },

    updateUserMarker() {
        if (!State.userCoords || !this.map) return;
        const coords = [State.userCoords.lat, State.userCoords.lng];
        
        if (this.userMarker) {
            this.userMarker.setLatLng(coords);
        } else {
            this.userMarker = L.circleMarker(coords, {
                radius: 7,
                color: '#22c55e',
                fillColor: '#22c55e',
                fillOpacity: 0.8
            }).addTo(this.map).bindPopup("Ваша позиція");
        }
    },

    // Запит на сповіщення
    async requestNotificationPermission() {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") {
            await Notification.requestPermission();
        }
    },

    // Основна логіка перевірки загроз
    checkThreats() {
        if (!State.userCoords) return;

        State.targets.forEach(t => {
            const distance = getDistance(
                State.userCoords.lat, State.userCoords.lng,
                t.lat, t.lng
            );

            if (distance <= State.alertRadius) {
                if (!State.notifiedIds.has(t.id)) {
                    this.sendAlert(t, distance);
                    State.notifiedIds.add(t.id);
                }
            } else {
                // Якщо ціль вийшла за радіус, дозволяємо сповістити знову, якщо вона повернеться
                State.notifiedIds.delete(t.id);
            }
        });
    },

    sendAlert(target, distance) {
        const time = new Date().toLocaleTimeString('uk-UA');
        const message = `Ціль: ${target.label} | Дистанція: ${distance.toFixed(1)} км | Час: ${time}`;

        // 1. Внутрішній лог
        this.notify(`УВАГА! ОБ'ЄКТ У ЗОНІ: ${target.label} (${distance.toFixed(1)} км)`, "danger");

        // 2. Системне Push-сповіщення
        if (Notification.permission === "granted") {
            new Notification("⚠️ ТАКТИЧНА ЗАГРОЗА", {
                body: message,
                icon: "https://cdn-icons-png.flaticon.com/512/2592/2592231.png", // Замініть на свій логотип
                vibrate: [200, 100, 200]
            });
        }
    }
};

// ... (методи notify, renderTargetsList, updateMarkers залишаються з версії 3.2)

async function engine() {
    const data = await Parser.fetchData();
    if (data) {
        State.targets = data;
        ui.updateMarkers?.();
        ui.renderTargetsList?.();
        ui.checkThreats(); // ПЕРЕВІРКА ДИСТАНЦІЇ ПРИ КОЖНОМУ ОНОВЛЕННІ
        
        const counter = document.getElementById('obj-count');
        if (counter) counter.innerText = data.length;
    }
}

function init() {
    State.load();
    ui.initMap();
    ui.initGeolocation();
    ui.requestNotificationPermission();

    // Налаштування інпуту дистанції
    const radiusInput = document.getElementById('alert-radius');
    if (radiusInput) {
        radiusInput.addEventListener('change', (e) => {
            State.alertRadius = parseFloat(e.target.value) || 50;
            State.save();
            State.notifiedIds.clear(); // Скидаємо, щоб перевірити за новим радіусом
            ui.notify(`РАДІУС ОНОВЛЕНО: ${State.alertRadius} км`, "info");
        });
    }

    setInterval(() => {
        const clock = document.getElementById('clock');
        if (clock) clock.innerText = new Date().toLocaleTimeString('uk-UA');
    }, 1000);

    engine();
    setInterval(engine, 5000);
}

window.onload = init;
