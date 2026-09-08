(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('TurboOS CMS v2 requires an Unsandboxed extension.');
    }

    class TurboOSCMSv2 {
        constructor() {
            this.running = false;
            this.background = '#101827';
            this.ui = new Map();
            this.nextId = 1;
            this.lastUI = '';
            this.lastClicked = '';
            this.lastX = 0;
            this.lastY = 0;
            this.inputElements = new Map();

            this.stageWidth = 480;
            this.stageHeight = 360;
            this.stageCanvas = null;
            this.overlay = null;
            this.canvas = null;
            this.ctx = null;
            this.resizeObserver = null;
            this.animationFrame = 0;

            this.installStyles();
            this.ensureOverlay();
            this.startLoop();
        }

        getInfo() {
            return {
                id: 'turbooscmsv2',
                name: 'TurboOS CMS v2',
                color1: '#2563eb',
                color2: '#1d4ed8',
                color3: '#1e3a8a',
                blocks: [
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'startOS', text: 'OSを起動' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'shutdown', text: 'OSを終了' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'restart', text: 'OSを再起動' },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'clear', text: '画面をクリア' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setBackground', text: '背景を [COLOR] にする', arguments: { COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#101827' } } },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'addText', text: 'テキスト [TEXT] x [X] y [Y] サイズ [SIZE] で作る', arguments: {
                        TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'TurboOS' },
                        X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 24 }
                    } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'addRect', text: '四角形 x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする', arguments: {
                        X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 120 }, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
                        ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                    } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'addButton', text: 'ボタン [TEXT] x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする', arguments: {
                        TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'OK' },
                        X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 36 },
                        ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                    } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'addInput', text: '入力欄 x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする', arguments: {
                        X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                        W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 160 }, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 34 },
                        ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                    } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'addWindow', text: 'ウィンドウ [TITLE] x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする', arguments: {
                        TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: 'Window' },
                        X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 20 },
                        W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 300 }, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 180 },
                        ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                    } },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setText', text: '最後のUIの文字を [TEXT] にする', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setPosition', text: '最後のUIを x [X] y [Y] にする', arguments: { X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }, Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setSize', text: '最後のUIの幅 [W] 高さ [H] にする', arguments: { W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }, H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 40 } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setColor', text: '最後のUIの [PROP] を [COLOR] にする', arguments: {
                        PROP: { type: Scratch.ArgumentType.STRING, menu: 'colorMenu' }, COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' }
                    } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setRadius', text: '最後のUIの角丸を [RADIUS] にする', arguments: { RADIUS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setVisible', text: '最後のUIを [VISIBLE] にする', arguments: { VISIBLE: { type: Scratch.ArgumentType.STRING, menu: 'visibleMenu' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'deleteUI', text: 'UI [ID] を削除', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'frontUI', text: 'UI [ID] を最前面にする', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    '---',
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'lastId', text: '最後のUIのID' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'uiCount', text: 'UIの数' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'clicked', text: 'UI [ID] が押された？', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'inputValue', text: '入力欄 [ID] の文字', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseX', text: 'UIマウス x' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseY', text: 'UIマウス y' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osState', text: 'OSの状態' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'isRunning', text: 'OSは起動中？' }
                ],
                menus: {
                    cornerMenu: { acceptReporters: false, items: ['丸く', '角'] },
                    colorMenu: { acceptReporters: false, items: ['文字色', '背景色', '枠線色'] },
                    visibleMenu: { acceptReporters: false, items: ['表示', '非表示'] }
                }
            };
        }

        installStyles() {
            if (document.getElementById('turboos-cms-v2-style')) return;
            const style = document.createElement('style');
            style.id = 'turboos-cms-v2-style';
            style.textContent = `
                #turboos-cms-v2-overlay { position:absolute; pointer-events:none; overflow:hidden; z-index:20; }
                #turboos-cms-v2-overlay canvas { display:block; width:100%; height:100%; }
                #turboos-cms-v2-input-layer { position:absolute; inset:0; pointer-events:none; }
                .turboos-cms-v2-input { position:absolute; box-sizing:border-box; margin:0; padding:6px 8px; outline:none; font:14px sans-serif; pointer-events:auto; }
            `;
            document.head.appendChild(style);
        }

        ensureOverlay() {
            const canvas = Scratch.renderer && Scratch.renderer.canvas;
            if (!canvas || !canvas.parentElement) return false;
            if (canvas === this.stageCanvas && this.overlay) return true;
            this.stageCanvas = canvas;
            if (this.overlay) this.overlay.remove();
            const parent = canvas.parentElement;
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
            this.overlay = document.createElement('div');
            this.overlay.id = 'turboos-cms-v2-overlay';
            this.overlay.style.display = 'none';
            this.overlay.innerHTML = '<canvas></canvas><div id="turboos-cms-v2-input-layer"></div>';
            parent.appendChild(this.overlay);
            this.canvas = this.overlay.querySelector('canvas');
            this.ctx = this.canvas.getContext('2d');
            this.overlay.addEventListener('pointerdown', e => this.pointer(e));
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(() => this.syncSize());
                this.resizeObserver.observe(canvas);
            }
            this.syncSize();
            return true;
        }

        syncSize() {
            if (!this.stageCanvas || !this.overlay || !this.canvas) return;
            const r = this.stageCanvas.getBoundingClientRect();
            const p = this.stageCanvas.parentElement.getBoundingClientRect();
            this.overlay.style.left = `${r.left - p.left}px`;
            this.overlay.style.top = `${r.top - p.top}px`;
            this.overlay.style.width = `${r.width}px`;
            this.overlay.style.height = `${r.height}px`;
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            this.canvas.width = Math.max(1, Math.round(r.width * dpr));
            this.canvas.height = Math.max(1, Math.round(r.height * dpr));
            this.ctx.setTransform((r.width * dpr) / this.stageWidth, 0, 0, (r.height * dpr) / this.stageHeight, (r.width * dpr) / 2, (r.height * dpr) / 2);
            this.render();
            this.updateInputs();
        }

        startLoop() {
            const loop = () => {
                this.animationFrame = requestAnimationFrame(loop);
                if (this.running) { this.render(); this.updateInputs(); }
            };
            this.animationFrame = requestAnimationFrame(loop);
        }

        stageX(clientX) {
            const r = this.stageCanvas.getBoundingClientRect();
            return ((clientX - r.left) / r.width) * this.stageWidth - this.stageWidth / 2;
        }

        stageY(clientY) {
            const r = this.stageCanvas.getBoundingClientRect();
            return this.stageHeight / 2 - ((clientY - r.top) / r.height) * this.stageHeight;
        }

        radius(v, w, h) {
            return String(v) === '丸く' ? Math.min(w, h) / 2 : 0;
        }

        create(type, props) {
            const id = `ui${this.nextId++}`;
            const item = {
                id, type, x: 0, y: 0, width: 100, height: 40,
                text: '', fontSize: 20, textColor: '#ffffff',
                backgroundColor: '#202938', borderColor: '#5b6b86', borderWidth: 1,
                radius: 0, visible: true, z: this.ui.size,
                titleHeight: 26, value: '', clicked: false,
                ...props
            };
            this.ui.set(id, item);
            this.lastUI = id;
            this.render();
            this.updateInputs();
            return id;
        }

        addText(a) { return this.create('text', { text: String(a.TEXT ?? ''), x: Number(a.X) || 0, y: Number(a.Y) || 0, fontSize: Math.max(1, Number(a.SIZE) || 24), width: 1, height: 1, borderWidth: 0, backgroundColor: 'transparent' }); }
        addRect(a) { const w = Math.max(1, Number(a.W) || 120), h = Math.max(1, Number(a.H) || 60); return this.create('rectangle', { x: Number(a.X) || 0, y: Number(a.Y) || 0, width: w, height: h, radius: this.radius(a.ROUND, w, h) }); }
        addButton(a) { const w = Math.max(1, Number(a.W) || 100), h = Math.max(1, Number(a.H) || 36); return this.create('button', { text: String(a.TEXT ?? 'OK'), x: Number(a.X) || 0, y: Number(a.Y) || 0, width: w, height: h, radius: this.radius(a.ROUND, w, h), backgroundColor: '#2563eb' }); }
        addInput(a) { const w = Math.max(1, Number(a.W) || 160), h = Math.max(1, Number(a.H) || 34); return this.create('input', { x: Number(a.X) || 0, y: Number(a.Y) || 0, width: w, height: h, radius: this.radius(a.ROUND, w, h), backgroundColor: '#111827' }); }
        addWindow(a) { const w = Math.max(1, Number(a.W) || 300), h = Math.max(1, Number(a.H) || 180); return this.create('window', { text: String(a.TITLE ?? 'Window'), x: Number(a.X) || 0, y: Number(a.Y) || 20, width: w, height: h, radius: this.radius(a.ROUND, w, h) }); }

        clear() { this.ui.clear(); this.inputElements.forEach(el => el.remove()); this.inputElements.clear(); this.lastUI = ''; this.render(); }
        setBackground(a) { this.background = String(a.COLOR || '#101827'); this.render(); }
        setText(a) { const u = this.ui.get(this.lastUI); if (u) u.text = String(a.TEXT ?? ''); }
        setPosition(a) { const u = this.ui.get(this.lastUI); if (u) { u.x = Number(a.X) || 0; u.y = Number(a.Y) || 0; } }
        setSize(a) { const u = this.ui.get(this.lastUI); if (u) { u.width = Math.max(1, Number(a.W) || 1); u.height = Math.max(1, Number(a.H) || 1); } }
        setColor(a) { const u = this.ui.get(this.lastUI); if (!u) return; const c = String(a.COLOR || '#fff'); const p = String(a.PROP); if (p === '文字色') u.textColor = c; else if (p === '背景色') u.backgroundColor = c; else u.borderColor = c; }
        setRadius(a) { const u = this.ui.get(this.lastUI); if (u) u.radius = Math.max(0, Number(a.RADIUS) || 0); }
        setVisible(a) { const u = this.ui.get(this.lastUI); if (u) u.visible = String(a.VISIBLE) === '表示'; }
        deleteUI(a) { const id = String(a.ID || ''); this.ui.delete(id); const el = this.inputElements.get(id); if (el) { el.remove(); this.inputElements.delete(id); } this.render(); }
        frontUI(a) { const u = this.ui.get(String(a.ID || '')); if (!u) return; const max = Math.max(-1, ...Array.from(this.ui.values()).map(x => x.z)); u.z = max + 1; }

        pointer(e) {
            if (!this.running) return;
            const x = this.stageX(e.clientX), y = this.stageY(e.clientY);
            this.lastX = x; this.lastY = y;
            const sorted = [...this.ui.values()].filter(u => u.visible).sort((a,b) => a.z - b.z).reverse();
            for (const u of sorted) {
                if (u.type === 'text') continue;
                const left = u.x, top = u.y, right = u.x + u.width, bottom = u.y - u.height;
                if (x >= left && x <= right && y <= top && y >= bottom) {
                    if (u.type === 'button') { u.clicked = true; this.lastClicked = u.id; }
                    if (u.type === 'input') { const el = this.inputElements.get(u.id); if (el) el.focus(); }
                    break;
                }
            }
        }

        drawRoundRect(ctx, x, y, w, h, r) {
            const rr = Math.max(0, Math.min(r, Math.abs(w)/2, Math.abs(h)/2));
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.lineTo(x + w - rr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
            ctx.lineTo(x + w, y + h - rr);
            ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
            ctx.lineTo(x + rr, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
            ctx.lineTo(x, y + rr);
            ctx.quadraticCurveTo(x, y, x + rr, y);
            ctx.closePath();
        }

        render() {
            if (!this.ctx) return;
            const c = this.ctx;
            c.clearRect(-this.stageWidth/2, -this.stageHeight/2, this.stageWidth, this.stageHeight);
            c.fillStyle = this.background;
            c.fillRect(-this.stageWidth/2, -this.stageHeight/2, this.stageWidth, this.stageHeight);
            const items = [...this.ui.values()].filter(u => u.visible).sort((a,b) => a.z - b.z);
            c.textBaseline = 'middle';
            for (const u of items) this.drawItem(c, u);
        }

        drawItem(c, u) {
            if (u.type === 'text') {
                c.font = `${u.fontSize}px sans-serif`;
                c.fillStyle = u.textColor;
                c.fillText(u.text, u.x, u.y);
                return;
            }
            c.save();
            const top = u.y - u.height;
            this.drawRoundRect(c, u.x, top, u.width, u.height, u.radius);
            c.fillStyle = u.backgroundColor;
            c.fill();
            c.lineWidth = u.borderWidth;
            if (u.borderWidth > 0) { c.strokeStyle = u.borderColor; c.stroke(); }
            if (u.type === 'window') {
                c.fillStyle = 'rgba(255,255,255,.09)'; c.fillRect(u.x, top, u.width, Math.min(26, u.height));
                c.fillStyle = u.textColor; c.font = '14px sans-serif'; c.fillText(u.text, u.x + 10, top + 13);
            } else if (u.type === 'button') {
                c.fillStyle = u.textColor; c.font = `${Math.max(12, Math.min(20, u.height/2))}px sans-serif`; c.textAlign = 'center'; c.fillText(u.text, u.x + u.width/2, top + u.height/2); c.textAlign = 'left';
            }
            c.restore();
        }

        updateInputs() {
            if (!this.stageCanvas || !this.overlay) return;
            const layer = this.overlay.querySelector('#turboos-cms-v2-input-layer');
            if (!layer) return;
            const r = this.stageCanvas.getBoundingClientRect();
            const wanted = new Set();
            for (const u of this.ui.values()) {
                if (u.type !== 'input') continue;
                wanted.add(u.id);
                let el = this.inputElements.get(u.id);
                if (!el) {
                    el = document.createElement('input');
                    el.className = 'turboos-cms-v2-input';
                    el.addEventListener('input', () => { u.value = el.value; });
                    this.inputElements.set(u.id, el);
                    layer.appendChild(el);
                }
                const sx = r.width / this.stageWidth;
                const sy = r.height / this.stageHeight;
                el.style.left = `${(u.x + this.stageWidth/2) * sx}px`;
                el.style.top = `${(this.stageHeight/2 - u.y) * sy - u.height * sy}px`;
                el.style.width = `${u.width * sx}px`;
                el.style.height = `${u.height * sy}px`;
                el.style.borderRadius = `${u.radius * Math.min(sx, sy)}px`;
                el.style.display = (this.running && u.visible) ? 'block' : 'none';
                el.value = u.value;
            }
            for (const [id, el] of this.inputElements) if (!wanted.has(id)) { el.remove(); this.inputElements.delete(id); }
        }

        startOS() { this.ensureOverlay(); this.running = true; this.overlay.style.display = 'block'; this.render(); this.updateInputs(); }
        shutdown() { this.running = false; if (this.overlay) this.overlay.style.display = 'none'; this.inputElements.forEach(el => el.style.display = 'none'); }
        restart() { this.shutdown(); setTimeout(() => this.startOS(), 120); }
        lastId() { return this.lastUI; }
        uiCount() { return this.ui.size; }
        clicked(a) { const u = this.ui.get(String(a.ID || '')); if (!u || u.type !== 'button') return false; const v = !!u.clicked; u.clicked = false; return v; }
        inputValue(a) { return this.ui.get(String(a.ID || ''))?.value || ''; }
        mouseX() { return this.lastX; }
        mouseY() { return this.lastY; }
        osState() { return this.running ? 'running' : 'off'; }
        isRunning() { return this.running; }
    }

    Scratch.extensions.register(new TurboOSCMSv2());
})(Scratch);
