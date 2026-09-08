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

            if (canvas === this.stageCanvas && this.overlay) {
                return true;
            }

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

        startRenderLoop() {
            if (this.animationFrame) return;

            const loop = () => {
                this.animationFrame = requestAnimationFrame(loop);

                // 描画だけは常時行う。
                // OS内部の進行は stepFrame() でのみ進む。
                if (this.running || this.state !== 'off') {
                    this.render();
                }
            };

            this.animationFrame = requestAnimationFrame(loop);
        }

        clear() {
            if (!this.ctx) return;

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

        text(text, x, y, size, color = '#ffffff', align = 'left') {
            this.ctx.fillStyle = color;
            this.ctx.font = `${size}px system-ui, sans-serif`;
            this.ctx.textAlign = align;
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(String(text), x, y);
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

            if (this.state === 'boot') {
                this.renderBoot();
                return;
            }

            if (this.state === 'kernel') {
                this.renderKernel();
                return;
            }

            if (this.state === 'services') {
                this.renderServices();
                return;
            }

            this.renderDesktop();
        }

        renderBoot() {
            const ctx = this.ctx;

            this.text('TurboOS', 0, -60, 42, '#ffffff', 'center');
            this.text('Firmware', 0, -18, 16, '#93c5fd', 'center');

            const items = [
                'Checking virtual CPU...',
                'Checking virtual memory...',
                'Checking display device...',
                'Checking input device...'
            ];

            const count = Math.min(items.length, Math.floor(this.frame / 8) + 1);

            for (let i = 0; i < count; i++) {
                this.text(`[ OK ] ${items[i]}`, -150, 28 + i * 24, 13, '#cbd5e1');
            }

            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(-150, 145, 300, 8);

            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(-150, 145, Math.min(300, this.frame * 5), 8);
        }

        renderKernel() {
            this.text('TurboOS', 0, -80, 40, '#ffffff', 'center');
            this.text('Loading Kernel', 0, -38, 16, '#93c5fd', 'center');

            const items = [
                'Virtual CPU manager',
                'Memory manager',
                'Display driver',
                'Input manager',
                'System clock'
            ];

            const count = Math.min(items.length, Math.floor((this.frame - 32) / 6) + 1);

            for (let i = 0; i < count; i++) {
                this.text(`[ OK ] ${items[i]}`, -140, 10 + i * 25, 13, '#cbd5e1');
            }
        }

        renderServices() {
            this.text('TurboOS', 0, -75, 40, '#ffffff', 'center');
            this.text('Starting system services', 0, -35, 16, '#93c5fd', 'center');

            const items = [
                'Window manager',
                'Desktop shell',
                'Event system',
                'Virtual filesystem'
            ];

            const count = Math.min(items.length, Math.floor((this.frame - 64) / 7) + 1);

            for (let i = 0; i < count; i++) {
                this.text(`[ OK ] ${items[i]}`, -130, 12 + i * 26, 13, '#cbd5e1');
            }
        }

        renderDesktop() {
            const ctx = this.ctx;
            const w = this.stageWidth;
            const h = this.stageHeight;

            // Desktop
            const gradient = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
            gradient.addColorStop(0, '#182437');
            gradient.addColorStop(1, '#08101d');
            ctx.fillStyle = gradient;
            ctx.fillRect(-w / 2, -h / 2, w, h);

            // Top bar
            ctx.fillStyle = 'rgba(10, 15, 24, 0.92)';
            ctx.fillRect(-w / 2, -h / 2, w, 28);

            this.text('TurboOS', -220, -166, 13, '#f8fafc');
            this.text('Desktop', -165, -166, 12, '#94a3b8');
            this.text('frame ' + this.frame, 170, -166, 11, '#64748b');

            // Icons
            this.desktopIcon(-180, -90, '▣', 'System');
            this.desktopIcon(-100, -90, '□', 'Files');
            this.desktopIcon(-20, -90, '›_', 'Terminal');

            // Welcome card
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            this.roundedRect(-150, -25, 300, 135, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
            ctx.stroke();

            this.text('Welcome to TurboOS', 0, 5, 22, '#f8fafc', 'center');
            this.text('Stage-based virtual operating system', 0, 36, 13, '#94a3b8', 'center');
            this.text('The OS is running.', 0, 66, 13, '#60a5fa', 'center');

            // Taskbar
            ctx.fillStyle = 'rgba(10, 15, 24, 0.96)';
            ctx.fillRect(-w / 2, h / 2 - 34, w, 34);

            this.text('◈', -220, 143, 16, '#60a5fa', 'center');
            this.text('TurboOS', -185, 143, 12, '#e2e8f0');
            this.text('Virtual Desktop', 185, 143, 11, '#94a3b8', 'right');
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
            this.background = '#020617';
            this.ensureOverlay();
            this.render();
        }

        stepFrame() {
            if (!this.running) return;

            this.frame += 1;

            if (this.frame < 32) {
                this.state = 'boot';
            } else if (this.frame < 64) {
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
            this.render();
        }

        osState() {
            return this.state;
        }

        osFrame() {
            return this.frame;
        }

        isRunning() {
            return this.running;
        }
    }

    Scratch.extensions.register(new TurboOS());
})(Scratch);
