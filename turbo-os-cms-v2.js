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

            this.cpuTicks = 0;
            this.timerTicks = 0;
            this.memoryTotal = 64 * 1024 * 1024;
            this.memoryUsed = 4 * 1024 * 1024;

            this.nextPid = 1;
            this.processes = [];
            this.currentPid = 0;
            this.schedulerIndex = 0;

            this.pendingInterrupts = [];
            this.handledInterrupts = 0;
            this.devices = new Map();

            this.mouseX = 0;
            this.mouseY = 0;
            this.keysDown = new Set();
            this.lastKey = '';
            this.inputInstalled = false;

            this.stageWidth = 480;
            this.stageHeight = 360;
            this.stageCanvas = null;
            this.overlay = null;
            this.canvas = null;
            this.ctx = null;
            this.resizeObserver = null;
            this.animationFrame = 0;

            this.kernelResponse = '';

            this.registerDevices();
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
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'startOS', text: 'OSを起動' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'stepFrame', text: 'OSを1f進める' },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'stepFrames',
                        text: 'OSを [COUNT] f進める',
                        arguments: { COUNT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'restart', text: 'OSを再起動' },
                    { blockType: Scratch.BlockType.COMMAND, opcode: 'shutdown', text: 'OSを終了' },
                    '---',
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'spawnProcess',
                        text: 'プロセス [NAME] を起動',
                        arguments: { NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'app' } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'killProcess',
                        text: 'PID [PID] を終了',
                        arguments: { PID: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'raiseInterrupt',
                        text: 'IRQ [IRQ] を発生させる',
                        arguments: { IRQ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 32 } }
                    },
                    {
                        blockType: Scratch.BlockType.COMMAND,
                        opcode: 'sendKernelCommand',
                        text: 'カーネルに [COMMAND] を送る',
                        arguments: { COMMAND: { type: Scratch.ArgumentType.STRING, defaultValue: 'ping' } }
                    },
                    '---',
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osState', text: 'OSの状態' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'osFrame', text: 'OSのフレーム数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'cpuTicksReporter', text: 'CPU tick' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'timerTicksReporter', text: 'タイマーtick' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'memoryUsedReporter', text: '使用メモリ(MB)' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'memoryTotalReporter', text: '総メモリ(MB)' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'processCountReporter', text: 'プロセス数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'currentPidReporter', text: '現在のPID' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'pendingInterruptsReporter', text: '保留中IRQ数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'handledInterruptsReporter', text: '処理済みIRQ数' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'lastKeyReporter', text: '最後に押されたキー' },
                    {
                        blockType: Scratch.BlockType.BOOLEAN,
                        opcode: 'keyDownReporter',
                        text: 'キー [KEY] が押されている？',
                        arguments: { KEY: { type: Scratch.ArgumentType.STRING, defaultValue: 'Space' } }
                    },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseXReporter', text: 'OSマウス x' },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'mouseYReporter', text: 'OSマウス y' },
                    {
                        blockType: Scratch.BlockType.REPORTER,
                        opcode: 'deviceStatus',
                        text: 'デバイス [DEVICE] の状態',
                        arguments: { DEVICE: { type: Scratch.ArgumentType.STRING, defaultValue: 'keyboard' } }
                    },
                    { blockType: Scratch.BlockType.REPORTER, opcode: 'kernelResponse', text: '最後のカーネル応答' },
                    { blockType: Scratch.BlockType.BOOLEAN, opcode: 'isRunning', text: 'OSは起動中？' }
                ]
            };
        }

        installStyles() {
            if (document.getElementById('turboos-stage-style')) return;
            const style = document.createElement('style');
            style.id = 'turboos-stage-style';
            style.textContent = `
                #turboos-stage-overlay { position: absolute; pointer-events: none; z-index: 20; overflow: hidden; }
                #turboos-stage-overlay canvas { display: block; width: 100%; height: 100%; }
            `;
            document.head.appendChild(style);
        }

        registerDevices() {
            this.devices.set('cpu', { connected: true, status: 'online' });
            this.devices.set('memory', { connected: true, status: 'online' });
            this.devices.set('display', { connected: true, status: 'online' });
            this.devices.set('keyboard', { connected: true, status: 'online' });
            this.devices.set('mouse', { connected: true, status: 'online' });
            this.devices.set('timer', { connected: true, status: 'online' });
            this.devices.set('storage', { connected: true, status: 'online' });
        }

        installInputManager() {
            if (this.inputInstalled) return;
            this.inputInstalled = true;

            window.addEventListener('keydown', event => {
                this.keysDown.add(event.key);
                this.lastKey = event.key;
                this.enqueueInterrupt(33, { type: 'keyboard', action: 'down', key: event.key, code: event.code, repeat: event.repeat });
            });

            window.addEventListener('keyup', event => {
                this.keysDown.delete(event.key);
                this.enqueueInterrupt(33, { type: 'keyboard', action: 'up', key: event.key, code: event.code });
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
                this.enqueueInterrupt(34, { type: 'mouse', action: 'down', button: event.button, x: this.mouseX, y: this.mouseY });
            });
            window.addEventListener('pointerup', event => {
                updatePointer(event);
                this.enqueueInterrupt(34, { type: 'mouse', action: 'up', button: event.button, x: this.mouseX, y: this.mouseY });
            });
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
            this.overlay.id = 'turboos-stage-overlay';
            this.overlay.style.display = 'none';
            this.canvas = document.createElement('canvas');
            this.overlay.appendChild(this.canvas);
            parent.appendChild(this.overlay);
            this.ctx = this.canvas.getContext('2d');

            if (typeof ResizeObserver !== 'undefined') {
                if (this.resizeObserver) this.resizeObserver.disconnect();
                this.resizeObserver = new ResizeObserver(() => this.syncStageSize());
                this.resizeObserver.observe(canvas);
            }

            this.syncStageSize();
            return true;
        }

        syncStageSize() {
            if (!this.stageCanvas || !this.overlay || !this.canvas || !this.ctx) return;
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

        startRenderLoop() {
            if (this.animationFrame) return;
            const loop = () => {
                this.animationFrame = requestAnimationFrame(loop);
                if (this.state !== 'off') this.render();
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

        enqueueInterrupt(irq, data = {}) {
            const number = this.toInteger(irq, 32);
            this.pendingInterrupts.push({ irq: number, frame: this.frame, data });
            if (this.pendingInterrupts.length > 128) {
                this.pendingInterrupts.splice(0, this.pendingInterrupts.length - 128);
            }
        }

        handleInterrupts() {
            const limit = Math.min(8, this.pendingInterrupts.length);
            for (let i = 0; i < limit; i++) {
                const interrupt = this.pendingInterrupts.shift();
                this.handledInterrupts += 1;
                if (interrupt.irq === 33 && interrupt.data.action === 'down') this.cpuTicks += 1;
            }
        }

        timerStep() {
            this.timerTicks += 1;
            this.enqueueInterrupt(32, { type: 'timer', tick: this.timerTicks });
        }

        scheduleProcess() {
            if (this.processes.length === 0) {
                this.currentPid = 0;
                return;
            }
            this.schedulerIndex = (this.schedulerIndex + 1) % this.processes.length;
            const process = this.processes[this.schedulerIndex];
            process.state = 'running';
            process.cpuTime += 1;
            this.currentPid = process.pid;
            for (const item of this.processes) {
                if (item.pid !== this.currentPid) item.state = 'ready';
            }
        }

        kernelTick() {
            this.cpuTicks += 1;
            this.timerStep();
            this.handleInterrupts();
            this.scheduleProcess();
        }

        normalizeString(value, fallback = '') {
            if (value === null || value === undefined) return fallback;
            return String(value);
        }

        toInteger(value, fallback = 0) {
            const number = Number(value);
            return Number.isFinite(number) ? Math.trunc(number) : fallback;
        }

        toCount(value) {
            return Math.max(0, Math.min(10000, this.toInteger(value, 1)));
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
            this.ctx.fillStyle = this.background;
            this.ctx.fillRect(-this.stageWidth / 2, -this.stageHeight / 2, this.stageWidth, this.stageHeight);

            switch (this.state) {
                case 'boot': this.renderBoot(); break;
                case 'kernel': this.renderKernel(); break;
                case 'services': this.renderServices(); break;
                case 'desktop': this.renderDesktop(); break;
            }
        }

        renderBoot() {
            this.text('TurboOS', 0, -82, 42, '#ffffff', 'center');
            this.text('Firmware / Bootloader', 0, -48, 15, '#93c5fd', 'center');
            const checks = ['Virtual CPU', 'Virtual memory', 'Display device', 'Input device', 'System bus'];
            const count = Math.min(checks.length, Math.floor(this.frame / 6) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${checks[i]}`, -150, -6 + i * 25, 13, '#cbd5e1');
            this.drawProgress(-150, 126, 300, 8, Math.min(1, this.frame / 30));
        }

        renderKernel() {
            this.text('TurboOS Kernel', 0, -84, 34, '#ffffff', 'center');
            this.text('Interrupt + device initialization', 0, -51, 14, '#93c5fd', 'center');
            const systems = ['CPU scheduler', 'Memory manager', 'Interrupt controller', 'Input manager', 'Display driver', 'System clock', 'Event queue'];
            const count = Math.min(systems.length, Math.floor((this.frame - 30) / 4) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${systems[i]}`, -150, -16 + i * 22, 12, '#cbd5e1');
            this.text(`CPU ${this.cpuTicks}`, 210, 104, 10, '#64748b', 'right');
            this.text(`IRQ ${this.pendingInterrupts.length}`, 210, 120, 10, '#64748b', 'right');
        }

        renderServices() {
            this.text('TurboOS', 0, -84, 38, '#ffffff', 'center');
            this.text('Starting system services', 0, -51, 15, '#93c5fd', 'center');
            const services = ['Process manager', 'Window manager', 'Desktop shell', 'Virtual filesystem', 'Event dispatcher'];
            const count = Math.min(services.length, Math.floor((this.frame - 62) / 4) + 1);
            for (let i = 0; i < count; i++) this.text(`[ OK ] ${services[i]}`, -145, -16 + i * 24, 13, '#cbd5e1');
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
            this.text('Desktop', -165, -166, 12, '#94a3b8');
            this.text('tick ' + this.cpuTicks, 215, -166, 10, '#64748b', 'right');

            this.desktopIcon(-180, -90, '▣', 'System');
            this.desktopIcon(-100, -90, '□', 'Files');
            this.desktopIcon(-20, -90, '>_', 'Terminal');

            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            this.roundedRect(-150, -25, 300, 135, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
            ctx.stroke();
            this.text('Welcome to TurboOS', 0, 5, 22, '#f8fafc', 'center');
            this.text('Stage-based virtual operating system', 0, 36, 13, '#94a3b8', 'center');
            this.text(`PID ${this.currentPid || '-'}  •  ${this.processes.length} process${this.processes.length === 1 ? '' : 'es'}`, 0, 64, 12, '#60a5fa', 'center');

            ctx.fillStyle = 'rgba(10, 15, 24, 0.96)';
            ctx.fillRect(-w / 2, h / 2 - 34, w, 34);
            this.text('◈', -220, 143, 16, '#60a5fa', 'center');
            this.text('TurboOS', -185, 143, 12, '#e2e8f0');
            this.text(`RAM ${(this.memoryUsed / 1024 / 1024).toFixed(1)} / ${(this.memoryTotal / 1024 / 1024).toFixed(0)} MB`, 220, 143, 10, '#94a3b8', 'right');
        }

        desktopIcon(x, y, icon, label) {
            const ctx = this.ctx;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            this.roundedRect(x - 26, y - 25, 52, 52, 8);
            ctx.fill();
            this.text(icon, x, y - 2, 23, '#93c5fd', 'center');
            this.text(label, x, y + 45, 11, '#e2e8f0', 'center');
        }

        startOS() {
            if (this.running) return;
            this.running = true;
            this.state = 'boot';
            this.frame = 0;
            this.cpuTicks = 0;
            this.timerTicks = 0;
            this.pendingInterrupts = [];
            this.handledInterrupts = 0;
            this.processes = [];
            this.currentPid = 0;
            this.schedulerIndex = 0;
            this.nextPid = 1;
            this.kernelResponse = '';
            this.background = '#020617';
            this.ensureOverlay();
            this.render();
        }

        stepFrame() {
            if (!this.running) return;
            this.frame += 1;
            this.kernelTick();

            if (this.frame < 32) this.state = 'boot';
            else if (this.frame < 64) this.state = 'kernel';
            else if (this.frame < 90) this.state = 'services';
            else {
                this.state = 'desktop';
                this.background = '#101827';
            }
            this.render();
        }

        stepFrames(args) {
            const count = this.toCount(args && args.COUNT);
            for (let i = 0; i < count; i++) {
                this.stepFrame();
                if (!this.running) break;
            }
        }

        spawnProcess(args) {
            const name = this.normalizeString(args && args.NAME, 'app').trim() || 'app';
            const pid = this.nextPid++;
            this.processes.push({ pid, name, state: 'ready', createdFrame: this.frame, cpuTime: 0 });
            this.memoryUsed = Math.min(this.memoryTotal, this.memoryUsed + 1024 * 1024);
            this.currentPid = pid;
            this.kernelResponse = `spawned ${name} (PID ${pid})`;
        }

        killProcess(args) {
            const pid = this.toInteger(args && args.PID, 0);
            const index = this.processes.findIndex(process => process.pid === pid);
            if (index === -1) {
                this.kernelResponse = `PID ${pid}: not found`;
                return;
            }
            this.processes.splice(index, 1);
            this.memoryUsed = Math.max(4 * 1024 * 1024, this.memoryUsed - 1024 * 1024);
            this.schedulerIndex = 0;
            this.currentPid = this.processes[0]?.pid || 0;
            this.kernelResponse = `killed PID ${pid}`;
        }

        raiseInterrupt(args) {
            const irq = this.toInteger(args && args.IRQ, 32);
            this.enqueueInterrupt(irq, { type: 'software' });
            this.kernelResponse = `queued IRQ ${irq}`;
        }

        sendKernelCommand(args) {
            const command = this.normalizeString(args && args.COMMAND, 'ping').trim().toLowerCase();
            switch (command) {
                case 'ping': this.kernelResponse = 'pong'; break;
                case 'yield': this.scheduleProcess(); this.kernelResponse = 'scheduler yield'; break;
                case 'sync': this.handleInterrupts(); this.kernelResponse = 'interrupt queue synchronized'; break;
                case 'reset-timer': this.timerTicks = 0; this.kernelResponse = 'timer reset'; break;
                default: this.kernelResponse = `unknown kernel command: ${command}`;
            }
        }

        restart() {
            this.shutdown();
            this.startOS();
        }

        shutdown() {
            this.running = false;
            this.state = 'off';
            this.frame = 0;
            this.render();
        }

        osState() { return this.state; }
        osFrame() { return this.frame; }
        cpuTicksReporter() { return this.cpuTicks; }
        timerTicksReporter() { return this.timerTicks; }
        memoryUsedReporter() { return this.memoryUsed / 1024 / 1024; }
        memoryTotalReporter() { return this.memoryTotal / 1024 / 1024; }
        processCountReporter() { return this.processes.length; }
        currentPidReporter() { return this.currentPid; }
        pendingInterruptsReporter() { return this.pendingInterrupts.length; }
        handledInterruptsReporter() { return this.handledInterrupts; }
        lastKeyReporter() { return this.lastKey; }
        keyDownReporter(args) { return this.keysDown.has(this.normalizeString(args && args.KEY)); }
        mouseXReporter() { return this.mouseX; }
        mouseYReporter() { return this.mouseY; }

        deviceStatus(args) {
            const name = this.normalizeString(args && args.DEVICE).trim().toLowerCase();
            const device = this.devices.get(name);
            return device ? device.status : 'not found';
        }

        kernelResponse() { return this.kernelResponse; }
        isRunning() { return this.running; }
    }

    Scratch.extensions.register(new TurboOS());
})(Scratch);
