(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('TurboOS requires an Unsandboxed extension.');
    }

    class TurboOS {
        constructor() {
            this.running = false;
            this.state = 'off';
            this.frame = 0;
            this.background = '#101827';

            // Virtual hardware / kernel state.
            this.cpuTicks = 0;
            this.uptime = 0;
            this.memoryTotal = 64 * 1024 * 1024;
            this.memoryUsed = 4 * 1024 * 1024;
            this.pidNext = 1;
            this.processes = [];

            // Input state is collected by the OS input manager.
            this.mouseX = 0;
            this.mouseY = 0;
            this.keysDown = new Set();
            this.lastKey = '';
            this.eventQueue = [];

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
            this.installInputManager();
            this.startRenderLoop();
        }

        getInfo() {
            return {
                id: 'turboos',
                name: 'TurboOS',
                color1: '#2563eb',
                color2: '#1d4ed8',
                color3: '#1e3a8a',
                blocks: [
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'startOS',
                        text: 'OSを起動'
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'stepFrame',
                        text: 'OSを1f進める'
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'restart',
                        text: 'OSを再起動'
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'shutdown',
                        text: 'OSを終了'
                    },
                    '---',
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'osState',
                        text: 'OSの状態'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'osFrame',
                        text: 'OSのフレーム数'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'cpuTicks',
                        text: 'CPU tick'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'uptime',
                        text: 'OS稼働時間(f)'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'memoryUsed',
                        text: '使用メモリ(MB)'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'memoryTotal',
                        text: '総メモリ(MB)'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'processCount',
                        text: 'プロセス数'
                    },
                    '---',
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'mouseXReporter',
                        text: 'OSマウス x'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'mouseYReporter',
                        text: 'OSマウス y'
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'lastKeyReporter',
                        text: '最後に押されたキー'
                    },
                    {
                        blockType: Scratch.BlockType.BOOLEAN,
                        opcode: 'keyDownReporter',
                        text: 'キー [KEY] が押されている？',
                        arguments: {
                            KEY: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Space'
                            }
                        }
                    },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'eventQueueSize',
                        text: 'OSイベント数'
                    },
                    {
                        blockType: Scratch.BlockType.BOOLEAN,
                        opcode: 'isRunning',
                        text: 'OSは起動中？'
                    }
                ]
            };
        }

        installStyles() {
            if (document.getElementById('turboos-stage-style')) return;

            const style = document.createElement('style');
            style.id = 'turboos-stage-style';
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
            `;
            document.head.appendChild(style);
        }

        ensureOverlay() {
            const canvas = Scratch.renderer && Scratch.renderer.canvas;
            if (!canvas || !canvas.parentElement) return false;

            if (canvas === this.stageCanvas && this.overlay) return true;

            this.stageCanvas = canvas;

            if (this.overlay) {
                this.overlay.remove();
            }

            const parent = canvas.parentElement;
            if (getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }

            this.overlay = document.createElement('div');
            this.overlay.id = 'turboos-stage-overlay';
            this.overlay.style.display = 'none';

            this.canvas = document.createElement('canvas');
            this.overlay.appendChild(this.canvas);
            parent.appendChild(this.overlay);

            this.ctx = this.canvas.getContext('2d');

            if (typeof ResizeObserver !== 'undefined') {
                if (this.resizeObserver) {
                    this.resizeObserver.disconnect();
                }
                this.resizeObserver = new ResizeObserver(() => {
                    this.syncStageSize();
                });
                this.resizeObserver.observe(canvas);
            }

            this.syncStageSize();
            return true;
        }

        syncStageSize() {
            if (!this.stageCanvas || !this.overlay || !this.canvas || !this.ctx) {
                return;
            }

            const rect = this.stageCanvas.getBoundingClientRect();
            const parentRect = this.stageCanvas.parentElement.getBoundingClientRect();

            this.overlay.style.left = `${rect.left - parentRect.left}px`;
            this.overlay.style.top = `${rect.top - parentRect.top}px`;
            this.overlay.style.width = `${rect.width}px`;
            this.overlay.style.height = `${rect.height}px`;

            const dpr = Math.max(1, window.devicePixelRatio || 1);
            this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
            this.canvas.height = Math.max(1, Math.round(rect.height * dpr));

            this.ctx.setTransform(
                (rect.width * dpr) / this.stageWidth,
                0,
                0,
                (rect.height * dpr) / this.stageHeight,
                (rect.width * dpr) / 2,
                (rect.height * dpr) / 2
            );

            this.render();
        }

        installInputManager() {
            if (this.inputManagerInstalled) return;
            this.inputManagerInstalled = true;

            window.addEventListener('keydown', event => {
                this.keysDown.add(event.key);
                this.lastKey = event.key;
                this.enqueueEvent({
                    type: 'keydown',
                    key: event.key,
                    code: event.code,
                    repeat: event.repeat
                });
            });

            window.addEventListener('keyup', event => {
                this.keysDown.delete(event.key);
                this.enqueueEvent({
                    type: 'keyup',
                    key: event.key,
                    code: event.code
                });
            });

            const updatePointer = event => {
                if (!this.stageCanvas) return;

                const rect = this.stageCanvas.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return;

                this.mouseX = ((event.clientX - rect.left) / rect.width) * this.stageWidth - this.stageWidth / 2;
                this.mouseY = this.stageHeight / 2 - ((event.clientY - rect.top) / rect.height) * this.stageHeight;
            };

            window.addEventListener('pointermove', updatePointer);

            window.addEventListener('pointerdown', event => {
                updatePointer(event);
                this.enqueueEvent({
                    type: 'pointerdown',
                    button: event.button,
                    x: this.mouseX,
                    y: this.mouseY
                });
            });

            window.addEventListener('pointerup', event => {
                updatePointer(event);
                this.enqueueEvent({
                    type: 'pointerup',
                    button: event.button,
                    x: this.mouseX,
                    y: this.mouseY
                });
            });
        }

        enqueueEvent(event) {
            this.eventQueue.push({
                frame: this.frame,
                ...event
            });

            // Prevent an abandoned project from growing the queue forever.
            if (this.eventQueue.length > 256) {
                this.eventQueue.splice(0, this.eventQueue.length - 256);
            }
        }

        consumeEvents() {
            const events = this.eventQueue.splice(0);

            for (const event of events) {
                if (event.type === 'keydown') {
                    this.cpuTicks += 1;
                }
            }
        }

        startRenderLoop() {
            if (this.animationFrame) return;

            const loop = () => {
                this.animationFrame = requestAnimationFrame(loop);

                // Rendering is continuous, but OS time advances only through stepFrame().
                if (this.state !== 'off') {
                    this.render();
                }
            };

            this.animationFrame = requestAnimationFrame(loop);
        }

        clear() {
            if (!this.ctx || !this.canvas) return;

            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }

        roundedRect(x, y, w, h, r) {
            const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));

            this.ctx.beginPath();
            this.ctx.moveTo(x + radius, y);
            this.ctx.arcTo(x + w, y, x + w, y + h, radius);
            this.ctx.arcTo(x + w, y + h, x, y + h, radius);
            this.ctx.arcTo(x, y + h, x, y, radius);
            this.ctx.arcTo(x, y, x + w, y, radius);
            this.ctx.closePath();
        }

        text(value, x, y, size, color = '#ffffff', align = 'left') {
            this.ctx.fillStyle = color;
            this.ctx.font = `${size}px system-ui, sans-serif`;
            this.ctx.textAlign = align;
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(String(value), x, y);
        }

        drawProgress(x, y, w, h, progress) {
            this.ctx.fillStyle = '#1e293b';
            this.roundedRect(x, y, w, h, 4);
            this.ctx.fill();

            this.ctx.fillStyle = '#3b82f6';
            this.roundedRect(x, y, w * Math.max(0, Math.min(1, progress)), h, 4);
            this.ctx.fill();
        }

        render() {
            if (!this.ctx || !this.canvas || !this.overlay) {
                this.ensureOverlay();
                if (!this.ctx) return;
            }

            this.overlay.style.display = this.state === 'off' ? 'none' : 'block';

            if (this.state === 'off') {
                this.clear();
                return;
            }

            this.clear();

            const ctx = this.ctx;
            const w = this.stageWidth;
            const h = this.stageHeight;

            ctx.fillStyle = this.background;
            ctx.fillRect(-w / 2, -h / 2, w, h);

            switch (this.state) {
                case 'boot':
                    this.renderBoot();
                    break;
                case 'kernel':
                    this.renderKernel();
                    break;
                case 'services':
                    this.renderServices();
                    break;
                case 'desktop':
                    this.renderDesktop();
                    break;
            }
        }

        renderBoot() {
            this.text('TurboOS', 0, -82, 42, '#ffffff', 'center');
            this.text('Firmware / Bootloader', 0, -48, 15, '#93c5fd', 'center');

            const checks = [
                'Virtual CPU',
                'Virtual memory',
                'Display device',
                'Input device',
                'System bus'
            ];

            const count = Math.min(checks.length, Math.floor(this.frame / 6) + 1);

            for (let i = 0; i < count; i++) {
                this.text(`[ OK ] ${checks[i]}`, -150, -6 + i * 25, 13, '#cbd5e1');
            }

            this.drawProgress(-150, 126, 300, 8, Math.min(1, this.frame / 30));
        }

        renderKernel() {
            this.text('TurboOS Kernel', 0, -80, 34, '#ffffff', 'center');
            this.text('Initializing kernel subsystems', 0, -48, 14, '#93c5fd', 'center');

            const systems = [
                'CPU scheduler',
                'Memory manager',
                'Input manager',
                'Display driver',
                'System clock',
                'Event queue'
            ];

            const count = Math.min(
                systems.length,
                Math.floor((this.frame - 30) / 5) + 1
            );

            for (let i = 0; i < count; i++) {
                this.text(`[ OK ] ${systems[i]}`, -145, -14 + i * 25, 13, '#cbd5e1');
            }

            this.text(`CPU tick: ${this.cpuTicks}`, 145, 88, 11, '#64748b', 'right');
            this.text(`MEM: ${(this.memoryUsed / 1024 / 1024).toFixed(1)} / ${(this.memoryTotal / 1024 / 1024).toFixed(0)} MB`, 145, 108, 11, '#64748b', 'right');
        }

        renderServices() {
            this.text('TurboOS', 0, -82, 38, '#ffffff', 'center');
            this.text('Starting system services', 0, -49, 15, '#93c5fd', 'center');

            const services = [
                'Process manager',
                'Window manager',
                'Desktop shell',
                'Virtual filesystem',
                'Event dispatcher'
            ];

            const count = Math.min(
                services.length,
                Math.floor((this.frame - 62) / 5) + 1
            );

            for (let i = 0; i < count; i++) {
                this.text(`[ OK ] ${services[i]}`, -140, -12 + i * 24, 13, '#cbd5e1');
            }
        }

        renderDesktop() {
            const ctx = this.ctx;
            const w = this.stageWidth;
            const h = this.stageHeight;

            const gradient = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
            gradient.addColorStop(0, '#182437');
            gradient.addColorStop(1, '#08101d');
            ctx.fillStyle = gradient;
            ctx.fillRect(-w / 2, -h / 2, w, h);

            ctx.fillStyle = 'rgba(10, 15, 24, 0.94)';
            ctx.fillRect(-w / 2, -h / 2, w, 28);

            this.text('TurboOS', -220, -166, 13, '#f8fafc');
            this.text('Desktop', -160, -166, 12, '#94a3b8');
            this.text(`tick ${this.cpuTicks}`, 165, -166, 11, '#64748b', 'right');

            this.desktopIcon(-180, -84, '▣', 'System');
            this.desktopIcon(-100, -84, '□', 'Files');
            this.desktopIcon(-20, -84, '>_', 'Terminal');

            ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
            this.roundedRect(-155, -8, 310, 128, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
            ctx.stroke();

            this.text('Welcome to TurboOS', 0, 18, 22, '#f8fafc', 'center');
            this.text('Kernel is running normally.', 0, 48, 13, '#94a3b8', 'center');
            this.text(`CPU tick: ${this.cpuTicks}`, 0, 73, 12, '#60a5fa', 'center');
            this.text(`Processes: ${this.processes.length}`, 0, 95, 12, '#60a5fa', 'center');

            ctx.fillStyle = 'rgba(10, 15, 24, 0.96)';
            ctx.fillRect(-w / 2, h / 2 - 34, w, 34);

            this.text('◈', -220, 143, 16, '#60a5fa', 'center');
            this.text('TurboOS', -185, 143, 12, '#e2e8f0');
            this.text(`mouse ${Math.round(this.mouseX)}, ${Math.round(this.mouseY)}`, 210, 143, 10, '#64748b', 'right');
        }

        desktopIcon(x, y, icon, label) {
            const ctx = this.ctx;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            this.roundedRect(x - 26, y - 25, 52, 52, 8);
            ctx.fill();
            this.text(icon, x, y - 2, 23, '#93c5fd', 'center');
            this.text(label, x, y + 45, 11, '#e2e8f0', 'center');
        }

        initializeProcesses() {
            this.processes = [];
            this.pidNext = 1;

            this.createProcess('kernel');
            this.createProcess('init');
            this.createProcess('desktop');
        }

        createProcess(name) {
            const process = {
                pid: this.pidNext++,
                name,
                state: 'running',
                ticks: 0
            };

            this.processes.push(process);
            this.memoryUsed += 512 * 1024;
            return process;
        }

        kernelTick() {
            this.cpuTicks += 1;
            this.uptime += 1;

            for (const process of this.processes) {
                if (process.state === 'running') {
                    process.ticks += 1;
                }
            }

            // A tiny simulated scheduler heartbeat.
            if (this.processes.length && this.cpuTicks % 10 === 0) {
                const first = this.processes.shift();
                if (first) this.processes.push(first);
            }

            this.consumeEvents();
        }

        startOS() {
            if (this.running) return;

            this.running = true;
            this.state = 'boot';
            this.frame = 0;
            this.cpuTicks = 0;
            this.uptime = 0;
            this.memoryUsed = 4 * 1024 * 1024;
            this.eventQueue.length = 0;
            this.background = '#020617';
            this.initializeProcesses();
            this.ensureOverlay();
            this.render();
        }

        stepFrame() {
            if (!this.running) return;

            this.frame += 1;
            this.kernelTick();

            if (this.frame < 30) {
                this.state = 'boot';
            } else if (this.frame < 62) {
                this.state = 'kernel';
            } else if (this.frame < 90) {
                this.state = 'services';
            } else {
                this.state = 'desktop';
                this.background = '#101827';
            }

            this.render();
        }

        restart() {
            this.shutdown();
            this.startOS();
        }

        shutdown() {
            this.running = false;
            this.state = 'off';
            this.frame = 0;
            this.cpuTicks = 0;
            this.uptime = 0;
            this.processes = [];
            this.eventQueue.length = 0;
            this.render();
        }

        osState() {
            return this.state;
        }

        osFrame() {
            return this.frame;
        }

        cpuTicks() {
            return this.cpuTicks;
        }

        uptime() {
            return this.uptime;
        }

        memoryUsed() {
            return +(this.memoryUsed / 1024 / 1024).toFixed(2);
        }

        memoryTotal() {
            return this.memoryTotal / 1024 / 1024;
        }

        processCount() {
            return this.processes.length;
        }

        mouseXReporter() {
            return Math.round(this.mouseX * 100) / 100;
        }

        mouseYReporter() {
            return Math.round(this.mouseY * 100) / 100;
        }

        lastKeyReporter() {
            return this.lastKey;
        }

        keyDownReporter(args) {
            return this.keysDown.has(String(args.KEY));
        }

        eventQueueSize() {
            return this.eventQueue.length;
        }

        isRunning() {
            return this.running;
        }
    }

    Scratch.extensions.register(new TurboOS());
})(Scratch);
