(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('TurboOS CMS requires an Unsandboxed extension.');
    }

    class TurboOSCMS {
        constructor() {
            this.running = false;
            this.state = 'off';
            this.background = '#0b1020';

            this.overlay = null;
            this.canvas = null;
            this.ctx = null;
            this.stageCanvas = null;
            this.resizeObserver = null;
            this.animationFrame = null;

            this.stageWidth = 480;
            this.stageHeight = 360;

            // CMS UI tree. Each entry is a drawable object on the TurboWarp stage.
            this.ui = new Map();
            this.nextId = 1;
            this.selectedId = '';
            this.lastClickedId = '';

            this.installStyles();
            this.ensureStageOverlay();
            this.startRenderLoop();
        }

        getInfo() {
            return {
                id: 'turbooscms',
                name: 'TurboOS CMS',
                color1: '#2563eb',
                color2: '#1d4ed8',
                color3: '#1e3a8a',
                blocks: [
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'startOS', text: 'OSを起動' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'shutdown', text: 'OSを終了' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'restart', text: 'OSを再起動' },
                    '---',
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'clearUI', text: '画面をクリア' },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'setBackground',
                        text: '背景を [COLOR] にする',
                        arguments: { COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#0b1020' } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'addText',
                        text: 'テキスト [TEXT] x [X] y [Y]',
                        arguments: {
                            TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'TurboOS' },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'addTextStyled',
                        text: 'テキスト [TEXT] x [X] y [Y] サイズ [SIZE] 角を [ROUND] にする',
                        arguments: {
                            TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'TurboOS' },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            SIZE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 24 },
                            ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'addRectangle',
                        text: '四角形 x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする',
                        arguments: {
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 120 },
                            H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 60 },
                            ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'addButton',
                        text: 'ボタン [TEXT] x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする',
                        arguments: {
                            TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'OK' },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                            H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 36 },
                            ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'addInput',
                        text: '入力欄 x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする',
                        arguments: {
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 160 },
                            H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 34 },
                            ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'addWindow',
                        text: 'ウィンドウ [TITLE] x [X] y [Y] 幅 [W] 高さ [H] 角を [ROUND] にする',
                        arguments: {
                            TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: 'Window' },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 20 },
                            W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 300 },
                            H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 180 },
                            ROUND: { type: Scratch.ArgumentType.STRING, menu: 'cornerMenu' }
                        }
                    },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'setSelectedText', text: '最後に作ったUIの文字を [TEXT] にする', arguments: { TEXT: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello' } } },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'setSelectedColor',
                        text: '最後に作ったUIの [PROP] を [COLOR] にする',
                        arguments: {
                            PROP: { type: Scratch.ArgumentType.STRING, menu: 'colorPropertyMenu' },
                            COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'moveSelected',
                        text: '最後に作ったUIを x [X] y [Y] にする',
                        arguments: {
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'setSelectedSize',
                        text: '最後に作ったUIの幅を [W] 高さを [H] にする',
                        arguments: {
                            W: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                            H: { type: Scratch.ArgumentType.NUMBER, defaultValue: 40 }
                        }
                    },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'removeUI', text: 'UI [ID] を削除', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'showUI', text: 'UI [ID] を表示', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'hideUI', text: 'UI [ID] を隠す', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'bringToFront', text: 'UI [ID] を最前面にする', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'lastUIId', text: '最後に作ったUIのID' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'uiCount', text: 'UIの数' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'buttonClicked', text: 'ボタン [ID] が押された？', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'inputValue', text: '入力欄 [ID] の文字', arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'ui1' } } },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'systemInfo', text: 'OS情報' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'isRunning', text: 'OSは起動中？' }
                ],
                menus: {
                    cornerMenu: { acceptReporters: false, items: ['丸く', '角'] },
                    colorPropertyMenu: { acceptReporters: false, items: ['文字色', '背景色', '枠線色'] }
                }
            };
        }

        installStyles() {
            if (document.getElementById('turboos-cms-style')) return;
            const style = document.createElement('style');
            style.id = 'turboos-cms-style';
            style.textContent = `
                #turboos-stage-overlay {
                    position: absolute;
                    pointer-events: none;
                    z-index: 20;
                    overflow: hidden;
                }
                #turboos-stage-overlay canvas {
                    display: block;
                    width: 100%;
                    height: 100%;
                }
                #turboos-stage-input-layer {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                }
                .turboos-stage-input {
                    position: absolute;
                    margin: 0;
                    padding: 5px 8px;
                    box-sizing: border-box;
                    border: 1px solid rgba(255,255,255,.35);
                    background: rgba(20,24,32,.96);
                    color: #fff;
                    outline: none;
                    font: 14px sans-serif;
                    pointer-events: auto;
                }
            `;
            document.head.appendChild(style);
        }

        ensureStageOverlay() {
            const renderer = Scratch.renderer;
            const canvas = renderer && renderer.canvas;
            if (!canvas || !canvas.parentElement) return false;

            if (this.stageCanvas === canvas && this.overlay) return true;

            this.stageCanvas = canvas;
            if (this.overlay) this.overlay.remove();

            const parent = canvas.parentElement;
            if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

            this.overlay = document.createElement('div');
            this.overlay.id = 'turboos-stage-overlay';
            this.overlay.style.display = 'none';
            this.overlay.innerHTML = `
                <canvas id="turboos-stage-canvas"></canvas>
                <div id="turboos-stage-input-layer"></div>
            `;
            parent.appendChild(this.overlay);

            this.canvas = this.overlay.querySelector('#turboos-stage-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.overlay.addEventListener('pointerdown', event => this.handlePointer(event));

            if (this.resizeObserver) this.resizeObserver.disconnect();
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(() => this.syncStageSize());
                this.resizeObserver.observe(canvas);
            }
            this.syncStageSize();
            return true;
        }

        syncStageSize() {
            if (!this.stageCanvas || !this.overlay || !this.canvas) return;
            const rect = this.stageCanvas.getBoundingClientRect();
            const parentRect = this.stageCanvas.parentElement.getBoundingClientRect();
            this.overlay.style.left = `${rect.left - parentRect.left}px`;
            this.overlay.style.top = `${rect.top - parentRect.top}px`;
            this.overlay.style.width = `${rect.width}px`;
            this.overlay.style.height = `${rect.height}px`;

            const dpr = Math.max(1, window.devicePixelRatio || 1);
            this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
            this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
            this.canvas.style.width = `${rect.width}px`;
            this.canvas.style.height = `${rect.height}px`;

            this.ctx.setTransform(
                rect.width * dpr / this.stageWidth,
                0,
                0,
                rect.height * dpr / this.stageHeight,
                rect.width * dpr / 2,
                rect.height * dpr / 2
            );
            this.render();
            this.updateInputElements();
        }

        startRenderLoop() {
            if (this.animationFrame) return;
            const loop = () => {
                this.animationFrame = requestAnimationFrame(loop);
                if (this.running) {
                    this.render();
                    this.updateInputElements();
                }
            };
            this.animationFrame = requestAnimationFrame(loop);
        }

        cornerRadius(value, width, height) {
            return String(value) === '丸く' ? Math.min(Math.abs(width), Math.abs(height)) / 2 : 0;
        }

        createUI(type, props = {}) {
            const id = `ui${this.nextId++}`;
            const item = {
                id,
                type,
                x: 0,
                y: 0,
                width: 100,
                height: 40,
                text: '',
                fontSize: 20,
                textColor: '#ffffff',
                backgroundColor: '#202938',
                borderColor: '#5b6b86',
                borderWidth: 1,
                radius: 0,
                visible: true,
                z: this.ui.size,
                titleHeight: 28,
                value: '',
                clicked: false,
                ...props
            };
            this.ui.set(id, item);
            this.selectedId = id;
            this.render();
            this.updateInputElements();
            return id;
        }

        addText(args) {
            return this.createUI('text', {
                text: String(args.TEXT ?? ''),
                x: Number(args.X) || 0,
                y: Number(args.Y) || 0,
                width: 1,
                height: 1,
                fontSize: 24,
                backgroundColor: 'transparent',
                borderWidth: 0
            });
        }

        addTextStyled(args) {
            return this.createUI('text', {
                text: String(args.TEXT ?? ''),
                x: Number(args.X) || 0,
                y: Number(args.Y) || 0,
                width: 1,
                height: 1,
                fontSize: Math.max(1, Number(args.SIZE) || 24),
                backgroundColor: 'transparent',
                borderWidth: 0,
                radius: this.cornerRadius(args.ROUND, 120, 40)
            });
        }

        addRectangle(args) {
            const w = Math.max(1, Number(args.W) || 120);
            const h = Math.max(1, Number(args.H) || 60);
            return this.createUI('rectangle', {
                x: Number(args.X) || 0,
                y: Number(args.Y) || 0,
                width: w,
                height: h,
                radius: this.cornerRadius(args.ROUND, w, h)
            });
        }

        addButton(args) {
            const w = Math.max(1, Number(args.W) || 100);
            const h = Math.max(1, Number(args.H) || 36);
            return this.createUI('button', {
                text: String(args.TEXT ?? 'OK'),
                x: Number(args.X) || 0,
                y: Number(args.Y) || 0,
                width: w,
                height: h,
                radius: this.cornerRadius(args.ROUND, w, h)
            });
        }

        addInput(args) {
            const w = Math.max(1, Number(args.W) || 160);
            const h = Math.max(1, Number(args.H) || 34);
            return this.createUI('input', {
                x: Number(args.X) || 0,
                y: Number(args.Y) || 0,
                width: w,
                height: h,
                radius: this.cornerRadius(args.ROUND, w, h)
            });
        }

        addWindow(args) {
            const w = Math.max(40, Number(args.W) || 300);
            const h = Math.max(40, Number(args.H) || 180);
            return this.createUI('window', {
                text: String(args.TITLE ?? 'Window'),
                x: Number(args.X) || 0,
                y: Number(args.Y) || 20,
                width: w,
                height: h,
                backgroundColor: '#18202d',
                borderColor: '#66748d',
                radius: this.cornerRadius(args.ROUND, w, h)
            });
        }

        setBackground(args) {
            this.background = String(args.COLOR || '#0b1020');
            this.render();
        }

        setSelectedText(args) {
            const item = this.ui.get(this.selectedId);
            if (!item) return;
            item.text = String(args.TEXT ?? '');
            this.render();
        }

        setSelectedColor(args) {
            const item = this.ui.get(this.selectedId);
            if (!item) return;
            const prop = String(args.PROP || '文字色');
            const color = String(args.COLOR || '#ffffff');
            if (prop === '文字色') item.textColor = color;
            else if (prop === '背景色') item.backgroundColor = color;
            else if (prop === '枠線色') item.borderColor = color;
            this.render();
        }

        moveSelected(args) {
            const item = this.ui.get(this.selectedId);
            if (!item) return;
            item.x = Number(args.X) || 0;
            item.y = Number(args.Y) || 0;
            this.render();
            this.updateInputElements();
        }

        setSelectedSize(args) {
            const item = this.ui.get(this.selectedId);
            if (!item) return;
            item.width = Math.max(1, Number(args.W) || item.width);
            item.height = Math.max(1, Number(args.H) || item.height);
            this.render();
            this.updateInputElements();
        }

        clearUI() {
            this.ui.clear();
            this.selectedId = '';
            this.lastClickedId = '';
            this.clearInputElements();
            this.render();
        }

        removeUI(args) {
            const id = String(args.ID || '');
            this.ui.delete(id);
            if (this.selectedId === id) this.selectedId = '';
            this.updateInputElements();
            this.render();
        }

        showUI(args) {
            const item = this.ui.get(String(args.ID || ''));
            if (!item) return;
            item.visible = true;
            this.render();
            this.updateInputElements();
        }

        hideUI(args) {
            const item = this.ui.get(String(args.ID || ''));
            if (!item) return;
            item.visible = false;
            this.render();
            this.updateInputElements();
        }

        bringToFront(args) {
            const item = this.ui.get(String(args.ID || ''));
            if (!item) return;
            item.z = Math.max(...[...this.ui.values()].map(v => v.z), 0) + 1;
            this.render();
        }

        lastUIId() {
            return this.selectedId;
        }

        uiCount() {
            return this.ui.size;
        }

        buttonClicked(args) {
            return this.lastClickedId === String(args.ID || '');
        }

        inputValue(args) {
            const item = this.ui.get(String(args.ID || ''));
            return item && item.type === 'input' ? item.value : '';
        }

        drawRoundedRect(ctx, x, y, w, h, r) {
            const rr = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
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
            if (!this.ensureStageOverlay() || !this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            ctx.clearRect(-240, -180, 480, 360);

            ctx.fillStyle = this.background;
            ctx.fillRect(-240, -180, 480, 360);

            const items = [...this.ui.values()]
                .filter(item => item.visible)
                .sort((a, b) => a.z - b.z);

            for (const item of items) this.drawItem(ctx, item);
        }

        drawItem(ctx, item) {
            const x = item.x - item.width / 2;
            const y = -item.y - item.height / 2;
            ctx.save();

            if (item.type === 'text') {
                ctx.fillStyle = item.textColor;
                ctx.font = `${Math.max(1, item.fontSize)}px sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText(item.text, item.x, -item.y);
                ctx.restore();
                return;
            }

            this.drawRoundedRect(ctx, x, y, item.width, item.height, item.radius);
            ctx.fillStyle = item.backgroundColor;
            ctx.fill();
            if (item.borderWidth > 0) {
                ctx.strokeStyle = item.borderColor;
                ctx.lineWidth = item.borderWidth;
                ctx.stroke();
            }

            if (item.type === 'window') {
                const titleH = Math.min(item.titleHeight, item.height);
                ctx.save();
                this.drawRoundedRect(ctx, x, y, item.width, titleH, item.radius);
                ctx.clip();
                ctx.fillStyle = '#202a39';
                ctx.fillRect(x, y, item.width, titleH);
                ctx.restore();
                ctx.fillStyle = item.textColor;
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(item.text, x + 10, y + titleH / 2);
            } else if (item.type === 'button') {
                ctx.fillStyle = item.textColor;
                ctx.font = `${Math.max(1, item.fontSize)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(item.text, item.x, -item.y);
            }

            ctx.restore();
        }

        eventToStage(event) {
            const rect = this.canvas.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            return {
                x: px * 480 - 240,
                y: -(py * 360 - 180)
            };
        }

        hitTest(x, y) {
            const items = [...this.ui.values()]
                .filter(item => item.visible)
                .sort((a, b) => b.z - a.z);
            for (const item of items) {
                if (!['button', 'input', 'window', 'rectangle'].includes(item.type)) continue;
                const left = item.x - item.width / 2;
                const right = item.x + item.width / 2;
                const bottom = item.y - item.height / 2;
                const top = item.y + item.height / 2;
                if (x >= left && x <= right && y >= bottom && y <= top) return item;
            }
            return null;
        }

        handlePointer(event) {
            if (!this.running) return;
            const pos = this.eventToStage(event);
            const item = this.hitTest(pos.x, pos.y);
            if (!item) return;
            this.selectedId = item.id;
            item.z = Math.max(...[...this.ui.values()].map(v => v.z), 0) + 1;
            if (item.type === 'button') {
                item.clicked = true;
                this.lastClickedId = item.id;
                setTimeout(() => { item.clicked = false; }, 120);
            }
            if (item.type === 'input') this.focusInput(item);
            this.render();
        }

        updateInputElements() {
            if (!this.overlay || !this.stageCanvas) return;
            const layer = this.overlay.querySelector('#turboos-stage-input-layer');
            if (!layer) return;
            const visible = new Set();
            const rect = this.stageCanvas.getBoundingClientRect();

            for (const item of this.ui.values()) {
                if (item.type !== 'input' || !item.visible) continue;
                visible.add(item.id);
                let input = layer.querySelector(`[data-ui-id="${CSS.escape(item.id)}"]`);
                if (!input) {
                    input = document.createElement('input');
                    input.className = 'turboos-stage-input';
                    input.dataset.uiId = item.id;
                    input.addEventListener('input', () => { item.value = input.value; });
                    input.addEventListener('pointerdown', event => event.stopPropagation());
                    layer.appendChild(input);
                }

                const sx = rect.width / 480;
                const sy = rect.height / 360;
                input.style.left = `${rect.width / 2 + (item.x - item.width / 2) * sx}px`;
                input.style.top = `${rect.height / 2 - (item.y + item.height / 2) * sy}px`;
                input.style.width = `${item.width * sx}px`;
                input.style.height = `${item.height * sy}px`;
                input.style.borderRadius = `${item.radius * ((sx + sy) / 2)}px`;
                input.value = item.value;
            }

            for (const input of [...layer.children]) {
                if (!visible.has(input.dataset.uiId)) input.remove();
            }
        }

        focusInput(item) {
            this.updateInputElements();
            const input = this.overlay?.querySelector(`[data-ui-id="${CSS.escape(item.id)}"]`);
            if (input) input.focus();
        }

        clearInputElements() {
            const layer = this.overlay?.querySelector('#turboos-stage-input-layer');
            if (layer) layer.innerHTML = '';
        }

        startOS() {
            this.ensureStageOverlay();
            if (!this.overlay) return;
            this.running = true;
            this.state = 'running';
            this.overlay.style.display = 'block';
            this.background = '#0b1020';
            this.clearUI();
            this.createUI('text', { text: 'TurboOS', x: 0, y: 60, width: 1, height: 1, fontSize: 38, z: 100 });
            this.createUI('text', { text: 'Stage-based CMS OS', x: 0, y: 20, width: 1, height: 1, fontSize: 17, textColor: '#b8c5d9', z: 100 });
            this.createUI('rectangle', { x: 0, y: -55, width: 260, height: 88, radius: 14, backgroundColor: '#172235', borderColor: '#415673', z: 90 });
            this.createUI('button', { text: 'Start', x: -65, y: -55, width: 100, height: 34, radius: 9, backgroundColor: '#263c5b', borderColor: '#7894b9', z: 100 });
            this.createUI('button', { text: 'Apps', x: 65, y: -55, width: 100, height: 34, radius: 9, backgroundColor: '#263c5b', borderColor: '#7894b9', z: 100 });
            this.render();
        }

        shutdown() {
            this.running = false;
            this.state = 'off';
            this.clearUI();
            if (this.overlay) this.overlay.style.display = 'none';
        }

        restart() {
            this.shutdown();
            setTimeout(() => this.startOS(), 150);
        }

        systemInfo() {
            return [
                'TurboOS CMS',
                'Version: 0.1',
                'Renderer: TurboWarp stage overlay',
                'UI model: CMS object tree',
                'UI objects: ' + this.ui.size
            ].join('\n');
        }

        isRunning() {
            return this.running;
        }
    }

    Scratch.extensions.register(new TurboOSCMS());
})(Scratch);
