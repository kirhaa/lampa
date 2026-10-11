(function () {
    'use strict';

    var PLUGIN_NAME = 'trout';
    var API_HOST = 'https://p.linkpp.ink';

    // Необязательно: ключ неофициального API Кинопоиска (kinopoiskapiunofficial.tech).
    // Нужен, если у карточки нет ID Кинопоиска: по нему плагин найдёт его сам.
    var KP_API_KEY = '';

    // Необязательно: CORS-прокси для загрузки страниц плееров (нужен в браузерной Lampa).
    // К префиксу дописывается закодированный URL. Пример: 'https://my-proxy.example/?url='
    var CORS_PROXY = '';

    // Какие балансеры показывать (пустой массив = все)
    var ALLOWED_BALANCERS = [];

    // Порядок балансеров в фильтре
    var PREFERRED = ['Alloha', 'Collaps', 'Vibix', 'Veoveo', 'Turbo'];

    // Порядок сортировки качества (чем раньше, тем выше)
    var QUALITY_RANK = ['4k', '2160', 'uhd', 'fullhd', 'fhd', '1080', 'bdrip', 'web-dl', 'webrip', 'hd', '720', 'dvdrip', 'sd', '480', '360', 'ts', 'cam'];

    var FETCH_TIMEOUT = 15000;

    if (window[PLUGIN_NAME + '_ready']) return;
    window[PLUGIN_NAME + '_ready'] = true;

    Lampa.Lang.add({
        trout_title: { ru: 'Trout', uk: 'Trout', en: 'Trout' },
        trout_nolink: {
            ru: 'Не удалось получить ссылки',
            uk: 'Не вдалося отримати посилання',
            en: 'Failed to get links'
        },
        trout_no_kp: {
            ru: 'Нет ID Кинопоиска',
            uk: 'Немає ID Кінопошуку',
            en: 'No Kinopoisk ID'
        },
        trout_balanser: { ru: 'Балансер', uk: 'Балансер', en: 'Balancer' },
        trout_voice: { ru: 'Перевод', uk: 'Переклад', en: 'Translation' },
        trout_quality: { ru: 'Качество', uk: 'Якість', en: 'Quality' },
        trout_season: { ru: 'Сезон', uk: 'Сезон', en: 'Season' },
        trout_episode: { ru: 'Серия', uk: 'Серія', en: 'Episode' },
        trout_all: { ru: 'Все', uk: 'Усі', en: 'All' },
        trout_watch: { ru: 'Смотреть', uk: 'Дивитися', en: 'Watch' },
        trout_default_voice: { ru: 'По умолчанию', uk: 'За замовчуванням', en: 'Default' },
        trout_loading_player: {
            ru: 'Загружаю данные плеера...',
            uk: 'Завантажую дані плеєра...',
            en: 'Loading player data...'
        },
        trout_fail_fetch: {
            ru: 'Страница плеера не загрузилась (сеть, CORS или блокировка). Нажмите «Диагностика».',
            uk: 'Сторінка плеєра не завантажилась (мережа, CORS або блокування). Натисніть «Діагностика».',
            en: 'Player page failed to load (network, CORS or blocked). Open "Diagnostics".'
        },
        trout_fail_parse: {
            ru: 'Страница загружена, но серии и потоки не распознаны. Нажмите «Диагностика».',
            uk: 'Сторінку завантажено, але серії та потоки не розпізнано. Натисніть «Діагностика».',
            en: 'Page loaded, but episodes and streams were not recognized. Open "Diagnostics".'
        },
        trout_open_iframe: {
            ru: 'Открыть во встроенном плеере (iframe)',
            uk: 'Відкрити у вбудованому плеєрі (iframe)',
            en: 'Open in embedded player (iframe)'
        },
        trout_diag: { ru: 'Диагностика', uk: 'Діагностика', en: 'Diagnostics' },
        trout_stream_failed: {
            ru: 'Прямой поток не найден, открываю встроенный плеер',
            uk: 'Прямий потік не знайдено, відкриваю вбудований плеєр',
            en: 'Direct stream not found, opening embedded player'
        }
    });

    // ---------- стили ----------

    $('head').append('<style>' +
        '.trout-item{display:flex;align-items:center;padding:1em 1.2em;margin-bottom:.8em;border-radius:.8em;background:rgba(255,255,255,.06)}' +
        '.trout-item.focus{background:#fff;color:#000}' +
        '.trout-item__icon{width:2.4em;height:2.4em;flex-shrink:0;margin-right:1em}' +
        '.trout-item__icon svg{width:100%;height:100%}' +
        '.trout-item__title{font-size:1.3em}' +
        '.trout-item__sub{opacity:.6;margin-top:.3em}' +
        '.trout-empty{padding:1.5em;text-align:center;opacity:.7}' +
        '.trout-player{position:fixed;left:0;top:0;width:100%;height:100%;z-index:9999;background:#000}' +
        '.trout-player iframe{width:100%;height:100%;border:0}' +
        '.trout-player__close{position:absolute;top:.6em;right:.6em;z-index:2;padding:.4em .9em;background:rgba(0,0,0,.65);color:#fff;border-radius:.5em;font-size:1.4em;cursor:pointer}' +
        '.trout-diag{padding:1em;white-space:pre-wrap;word-break:break-all;font-size:.9em;line-height:1.4}' +
        '</style>');

    Lampa.Template.add('trout_item',
        '<div class="trout-item selector">' +
            '<div class="trout-item__icon">' +
                '<svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<circle cx="64" cy="64" r="56" stroke="currentColor" stroke-width="16"/>' +
                    '<path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="currentColor"/>' +
                '</svg>' +
            '</div>' +
            '<div class="trout-item__text">' +
                '<div class="trout-item__title">{title}</div>' +
                '<div class="trout-item__sub">{quality}</div>' +
            '</div>' +
        '</div>'
    );

    // ---------- вспомогательные функции ----------

    function tr(key) {
        return Lampa.Lang.translate(key);
    }

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[Trout]');
            console.log.apply(console, args);
        } catch (e) {}
    }

    function getKinopoiskId(movie) {
        if (!movie) return null;
        if (movie.kinopoisk_id) return movie.kinopoisk_id;
        if (movie.kp_id) return movie.kp_id;
        if (movie.external_ids) {
            if (movie.external_ids.kinopoisk_id) return movie.external_ids.kinopoisk_id;
            if (movie.external_ids.kp_id) return movie.external_ids.kp_id;
        }
        if (movie.ids && movie.ids.kp) return movie.ids.kp;
        return null;
    }

    function getImdbId(movie) {
        if (!movie) return null;
        if (movie.imdb_id) return movie.imdb_id;
        if (movie.external_ids && movie.external_ids.imdb_id) return movie.external_ids.imdb_id;
        return null;
    }

    function isAllowedBalanser(type) {
        if (!ALLOWED_BALANCERS || !ALLOWED_BALANCERS.length) return true;
        var t = (type || '').toLowerCase();
        return ALLOWED_BALANCERS.some(function (b) {
            return b.toLowerCase() === t;
        });
    }

    function isUrl(url) {
        return /^(https?:)?\/\//i.test(String(url || ''));
    }

    function normalizeUrl(url) {
        url = String(url || '');
        if (url.indexOf('//') === 0) return 'https:' + url;
        return url;
    }

    function absoluteUrl(url, base) {
        url = String(url || '');
        if (/^https?:\/\//i.test(url)) return url;
        if (url.indexOf('//') === 0) return 'https:' + url;
        var origin = (String(base).match(/^(https?:\/\/[^\/]+)/i) || [])[1] || '';
        if (url.charAt(0) === '/') return origin + url;
        return origin + '/' + url;
    }

    function qualityRank(q) {
        var s = String(q || '').toLowerCase();
        for (var i = 0; i < QUALITY_RANK.length; i++) {
            if (s.indexOf(QUALITY_RANK[i]) > -1) return i;
        }
        return 999;
    }

    function unescapeText(s) {
        return String(s)
            .replace(/\\\//g, '/')
            .replace(/\\u0026/g, '&')
            .replace(/&amp;/g, '&');
    }

    // ---------- загрузка страниц плееров ----------

    function describeError(a, b) {
        var s = '';
        try {
            if (a && typeof a === 'object') {
                if (a.status !== undefined) s = 'status ' + a.status;
                if (a.statusText) s += ' ' + a.statusText;
            } else if (a) {
                s = String(a);
            }
            if (b) s += ' ' + String(b);
        } catch (e) {}
        return s || 'unknown';
    }

    function fetchText(url, ok, fail) {
        var target = CORS_PROXY ? CORS_PROXY + encodeURIComponent(url) : url;
        var net = new Lampa.Reguest();
        var errors = [];
        var finished = false;
        var params = { dataType: 'text', timeout: FETCH_TIMEOUT };

        function success(text) {
            if (finished) return;
            finished = true;
            ok(typeof text === 'string' ? text : JSON.stringify(text));
        }

        function viaSilent() {
            net.silent(target, success, function (a, b) {
                if (finished) return;
                finished = true;
                errors.push('silent: ' + describeError(a, b));
                fail(errors);
            }, false, params);
        }

        if (typeof net['native'] === 'function') {
            net['native'](target, success, function (a, b) {
                if (finished) return;
                errors.push('native: ' + describeError(a, b));
                viaSilent();
            }, false, params);
        } else {
            viaSilent();
        }
    }

    // ---------- разбор страниц плееров ----------

    /**
     * Ищет в тексте прямой поток: карта качеств mp4 вида [1080p]url, затем m3u8, затем mp4.
     */
    function findStream(html) {
        var text = unescapeText(html);
        var m;

        var map = {};
        var count = 0;
        var re = /\[(\d{3,4}p?)\]\s*(https?:\/\/[^\s,"'<>\\\]]+?\.mp4[^\s,"'<>\\\]]*)/gi;
        while ((m = re.exec(text)) !== null) {
            var label = /p$/i.test(m[1]) ? m[1] : m[1] + 'p';
            if (!map[label]) { map[label] = m[2]; count++; }
        }
        if (count) {
            var labels = Object.keys(map).sort(function (a, b) {
                return parseInt(b, 10) - parseInt(a, 10);
            });
            return { url: map[labels[0]], quality: count > 1 ? map : null, type: 'mp4-map' };
        }

        m = text.match(/https?:\/\/[^\s"'<>\\)]+?\.m3u8[^\s"'<>\\)]*/i);
        if (m) return { url: m[0], quality: null, type: 'hls' };

        m = text.match(/https?:\/\/[^\s"'<>\\)]+?\.mp4[^\s"'<>\\)]*/i);
        if (m) return { url: m[0], quality: null, type: 'mp4' };

        return null;
    }

    // Вырезает сбалансированный блок {...} или [...] начиная с позиции start
    function extractBalanced(text, start) {
        var open = text.charAt(start);
        var close = open === '{' ? '}' : ']';
        var depth = 0, inStr = false, quote = '', esc = false;

        for (var i = start; i < text.length; i++) {
            var c = text.charAt(i);
            if (inStr) {
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === quote) inStr = false;
                continue;
            }
            if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
            if (c === open) depth++;
            else if (c === close) {
                depth--;
                if (depth === 0) return text.substring(start, i + 1);
            }
        }
        return null;
    }

    // JSON.parse с поправками на JS-литералы (ключи без кавычек, одинарные кавычки, хвостовые запятые)
    function relaxedParse(str) {
        try { return JSON.parse(str); } catch (e) {}
        try {
            var fixed = str
                .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
                .replace(/'([^'\\]*)'/g, '"$1"')
                .replace(/,\s*([}\]])/g, '$1');
            return JSON.parse(fixed);
        } catch (e2) {}
        return null;
    }

    // Собирает все JSON-подобные блоки, которые могут содержать конфиг плеера
    function collectBlobs(html) {
        var blobs = [];
        var markers = ['makePlayer(', 'Playerjs(', 'new Player(', 'playerConfig', 'window.config', 'var config', 'playlist:', '"playlist"', 'seasons:', '"seasons"'];

        markers.forEach(function (marker) {
            var from = 0;
            var guard = 0;
            while (guard++ < 8) {
                var idx = html.indexOf(marker, from);
                if (idx === -1) break;
                from = idx + marker.length;

                var j = from;
                var limit = Math.min(html.length, from + 40);
                while (j < limit && html.charAt(j) !== '{' && html.charAt(j) !== '[') j++;
                if (j >= limit) continue;

                var block = extractBalanced(html, j);
                if (!block) continue;

                var parsed = relaxedParse(block);
                if (parsed && typeof parsed === 'object') blobs.push(parsed);
            }
        });

        var re = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
            var p = relaxedParse(m[1]);
            if (p && typeof p === 'object') blobs.push(p);
        }

        return blobs;
    }

    function pickQualityMap(o) {
        var cand = o.qualities || o.quality;
        if (!cand || typeof cand !== 'object' || Array.isArray(cand)) return null;

        var map = {};
        var count = 0;
        Object.keys(cand).forEach(function (k) {
            if (typeof cand[k] === 'string' && isUrl(cand[k])) {
                map[k] = normalizeUrl(unescapeText(cand[k]));
                count++;
            }
        });
        return count > 1 ? map : null;
    }

    // Достаёт ссылку на поток из объекта (серии, фильма)
    function pickStream(o, depth) {
        depth = depth || 0;
        if (!o || typeof o !== 'object' || depth > 3) return null;

        var keys = ['hls', 'm3u8', 'mp4', 'file', 'url', 'src', 'stream', 'video'];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = o[k];
            if (typeof v !== 'string') continue;

            v = unescapeText(v);
            var found = findStream(v);
            if (found) {
                return { url: found.url, quality: found.quality || pickQualityMap(o) };
            }
            if ((k === 'hls' || k === 'm3u8') && isUrl(v)) {
                return { url: normalizeUrl(v), quality: pickQualityMap(o) };
            }
        }

        if (o.source && typeof o.source === 'object') return pickStream(o.source, depth + 1);
        return null;
    }

    function pickVoices(o) {
        if (!o || typeof o !== 'object') return [];
        var list = [];

        function add(n) {
            if (typeof n === 'string' && n && list.indexOf(n) === -1) list.push(n);
            else if (n && typeof n === 'object') add(n.name || n.title || n.label);
        }

        var sources = [o, o.source];
        sources.forEach(function (s) {
            if (!s || typeof s !== 'object') return;
            if (s.audio && Array.isArray(s.audio.names)) s.audio.names.forEach(add);
            if (Array.isArray(s.voices)) s.voices.forEach(add);
            if (Array.isArray(s.translations)) s.translations.forEach(add);
        });

        return list;
    }

    function pickSubtitles(o, base) {
        var result = [];
        [o, o && o.source].forEach(function (s) {
            if (!s || typeof s !== 'object') return;
            var arr = s.cc || s.subtitles || s.subtitle;
            if (!Array.isArray(arr)) return;

            arr.forEach(function (sub) {
                if (!sub || typeof sub !== 'object') return;
                var u = sub.url || sub.src || sub.file;
                if (typeof u !== 'string') return;
                result.push({
                    label: sub.name || sub.label || sub.lang || 'Sub',
                    url: absoluteUrl(unescapeText(u), base || '')
                });
            });
        });
        return result;
    }

    function firstNumber(v, fallback) {
        if (typeof v === 'number') return v;
        var m = String(v === undefined || v === null ? '' : v).match(/\d+/);
        return m ? parseInt(m[0], 10) : fallback;
    }

    // Массив считается списком сезонов, если у его элементов есть вложенные списки серий
    function seasonsFromArray(arr) {
        if (!Array.isArray(arr) || !arr.length) return null;

        var seasons = [];
        for (var i = 0; i < arr.length; i++) {
            var s = arr[i];
            if (!s || typeof s !== 'object') return null;

            var eps = s.episodes || s.folder || s.playlist;
            if (!Array.isArray(eps)) return null;

            var number = s.season !== undefined ? s.season : (s.number !== undefined ? s.number : (s.id !== undefined ? s.id : s.title));
            var episodes = [];

            eps.forEach(function (e, j) {
                if (!e || typeof e !== 'object') return;
                var st = pickStream(e);
                var iframe = (typeof e.iframe === 'string' && isUrl(e.iframe)) ? e.iframe : null;
                if (!st && !iframe) return;

                var num = firstNumber(e.episode !== undefined ? e.episode : (e.number !== undefined ? e.number : (e.id !== undefined ? e.id : e.title)), j + 1);

                episodes.push({
                    number: num,
                    title: (typeof e.title === 'string' && e.title) ? e.title : (tr('trout_episode') + ' ' + num),
                    url: st ? st.url : null,
                    quality: st ? st.quality : null,
                    iframe: iframe,
                    voices: pickVoices(e),
                    subtitles: pickSubtitles(e)
                });
            });

            if (episodes.length) {
                seasons.push({ number: firstNumber(number, i + 1), episodes: episodes });
            }
        }

        return seasons.length ? seasons : null;
    }

    // Ищет в дереве список сезонов или одиночный поток
    function analyzeBlob(root) {
        var queue = [{ node: root, depth: 0 }];
        var movie = null;

        while (queue.length) {
            var cur = queue.shift();
            var node = cur.node;
            if (!node || typeof node !== 'object' || cur.depth > 7) continue;

            if (Array.isArray(node)) {
                var seasons = seasonsFromArray(node);
                if (seasons) return { type: 'serial', seasons: seasons };
            } else if (!movie) {
                var st = pickStream(node);
                if (st) {
                    movie = {
                        type: 'movie',
                        url: st.url,
                        quality: st.quality,
                        voices: pickVoices(node),
                        subtitles: pickSubtitles(node)
                    };
                }
            }

            var keys = Object.keys(node);
            for (var i = 0; i < keys.length; i++) {
                var child = node[keys[i]];
                if (child && typeof child === 'object') queue.push({ node: child, depth: cur.depth + 1 });
            }
        }

        return movie;
    }

    /**
     * Разбор страницы плеера.
     * Результат: { type: 'serial', seasons: [...] } или { type: 'movie', url, quality, voices, subtitles } или null.
     */
    function parseDetails(html) {
        var blobs = collectBlobs(html);

        var movie = null;
        for (var i = 0; i < blobs.length; i++) {
            var res = analyzeBlob(blobs[i]);
            if (res && res.type === 'serial') return res;
            if (res && !movie) movie = res;
        }
        if (movie) return movie;

        var found = findStream(html);
        if (found) {
            return { type: 'movie', url: found.url, quality: found.quality, voices: [], subtitles: [] };
        }
        return null;
    }

    function makeDiag(url, html, reason, errors) {
        html = html || '';
        var flags = ['makePlayer', 'Playerjs', 'm3u8', '.mp4', 'seasons', 'episodes', 'playlist', '<iframe'].filter(function (f) {
            return html.indexOf(f) > -1;
        });
        return {
            url: url,
            reason: reason,
            errors: errors || [],
            length: html.length,
            flags: flags.join(', '),
            head: html.replace(/\s+/g, ' ').substring(0, 500)
        };
    }

    function diagText(d) {
        var lines = ['URL: ' + d.url];
        lines.push('Причина: ' + (d.reason === 'fetch' ? 'страница не загрузилась' : 'данные не распознаны'));
        if (d.errors && d.errors.length) lines.push('Ошибки: ' + d.errors.join(' | '));
        if (d.length) {
            lines.push('Размер HTML: ' + d.length);
            lines.push('Найдено в коде: ' + (d.flags || '—'));
            lines.push('Начало страницы: ' + d.head);
        }
        return lines.join('\n');
    }

    // Загрузка и разбор страницы; при отсутствии данных один раз заходит во вложенный iframe
    function loadAndParse(url, depth, callback) {
        var target = normalizeUrl(url);

        fetchText(target, function (html) {
            var data = parseDetails(html);
            if (data) {
                log('parsed', target, data.type);
                return callback({ data: data, diag: null });
            }

            if (depth < 1) {
                var inner = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (inner) {
                    log('following inner iframe', inner[1]);
                    return loadAndParse(absoluteUrl(unescapeText(inner[1]), target), depth + 1, callback);
                }
            }

            var diag = makeDiag(target, html, 'parse');
            log('not recognized', diagText(diag));
            callback({ data: null, diag: diag });
        }, function (errors) {
            var diag = makeDiag(target, '', 'fetch', errors);
            log('fetch failed', diagText(diag));
            callback({ data: null, diag: diag });
        });
    }

    // Кэш данных плееров по URL
    var detailsCache = {};

    function getDetails(url, callback) {
        var c = detailsCache[url];
        if (c && c.done) return callback(c);
        if (c) { c.waiters.push(callback); return; }

        c = detailsCache[url] = { done: false, data: null, diag: null, waiters: [callback] };

        loadAndParse(url, 0, function (res) {
            c.done = true;
            c.data = res.data;
            c.diag = res.diag;
            var waiters = c.waiters;
            c.waiters = [];
            waiters.forEach(function (w) { w(c); });
        });
    }

    // ---------- iframe-плеер (запасной вариант) ----------

    var player = { layer: null, prev: null };

    function closePlayer() {
        if (!player.layer) return;
        player.layer.remove();
        player.layer = null;
        Lampa.Controller.toggle(player.prev || 'content');
    }

    function openIframe(url, title) {
        closePlayer();

        var enabled = Lampa.Controller.enabled();
        player.prev = enabled && enabled.name;

        var layer = $(
            '<div class="trout-player">' +
                '<div class="trout-player__close">&#10005;</div>' +
                '<iframe allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>' +
            '</div>'
        );

        layer.find('iframe').attr('src', normalizeUrl(url)).attr('title', title || '');
        layer.find('.trout-player__close').on('click', closePlayer);

        $('body').append(layer);
        player.layer = layer;

        Lampa.Controller.add('trout_player', {
            toggle: function () {
                Lampa.Controller.clear();
            },
            back: closePlayer
        });
        Lampa.Controller.toggle('trout_player');

        try { layer.find('iframe')[0].focus(); } catch (e) {}
    }

    function showDiag(diag) {
        var text = diagText(diag);
        var html = $('<div class="trout-diag"></div>').text(text);
        var enabled = Lampa.Controller.enabled();
        var prev = (enabled && enabled.name) || 'content';

        Lampa.Modal.open({
            title: tr('trout_diag'),
            html: html,
            size: 'large',
            onBack: function () {
                Lampa.Modal.close();
                Lampa.Controller.toggle(prev);
            }
        });
    }

    // ---------- компонент ----------

    function component(object) {
        var _this = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var items = [];
        var last = false;
        var destroyed = false;
        var playToken = 0;
        var filter_items = { balanser: [], voice: [], quality: [], season: [] };
        // voice и quality: '' = по умолчанию / «Все»
        var choice = { balanser: 0, voice: '', quality: '', season: 0 };

        this.create = function () {
            this.initialize();
            return this.render();
        };

        this.initialize = function () {
            filter.render().find('.filter--sort').remove();
            filter.render().find('.filter--search').addClass('hide');

            filter.onBack = function () {
                _this.start();
            };

            filter.onSelect = function (type, a, b) {
                if (type === 'filter') {
                    if (a.stype === 'balanser') {
                        choice.balanser = b.index;
                        choice.voice = '';
                        choice.quality = '';
                        choice.season = 0;
                        Lampa.Storage.set('trout_balanser', filter_items.balanser[b.index]);
                    }
                    if (a.stype === 'voice') {
                        choice.voice = filter_items.voice[b.index];
                        choice.quality = '';
                    }
                    if (a.stype === 'quality') {
                        choice.quality = b.index === 0 ? '' : filter_items.quality[b.index - 1];
                    }
                    if (a.stype === 'season') {
                        choice.season = b.index;
                    }
                    _this.draw();
                }
                Lampa.Select.close();
                _this.start();
            };

            files.appendHead(filter.render());
            files.appendFiles(scroll.render());
            scroll.minus(files.render().find('.explorer__files-head'));

            this.loading(true);
            this.search();
        };

        this.loading = function (status) {
            if (this.activity) {
                this.activity.loader(status);
                if (!status) this.activity.toggle();
            }
        };

        // ----- поиск источников в API -----

        this.search = function () {
            var movie = object.movie;
            var kp = getKinopoiskId(movie);

            if (kp || !KP_API_KEY) {
                this.requestPlayers(this.buildAttempts(movie, kp), 0);
                return;
            }

            this.fetchKinopoiskId(movie, function (found) {
                _this.requestPlayers(_this.buildAttempts(movie, found), 0);
            });
        };

        this.buildAttempts = function (movie, kp) {
            var attempts = [];
            if (kp) attempts.push('kinopoisk=' + encodeURIComponent(kp));
            var imdb = getImdbId(movie);
            if (imdb) attempts.push('imdb=' + encodeURIComponent(imdb));
            return attempts;
        };

        this.fetchKinopoiskId = function (movie, callback) {
            var imdb = getImdbId(movie);
            var title = (movie && (movie.title || movie.name)) || '';
            var date = (movie && (movie.release_date || movie.first_air_date)) || '';
            var year = String(date).slice(0, 4);
            var query;

            if (imdb) query = 'imdbId=' + encodeURIComponent(imdb);
            else if (title) query = 'keyword=' + encodeURIComponent(title) + (year ? '&yearFrom=' + year + '&yearTo=' + year : '');
            else return callback(null);

            network.silent(
                'https://kinopoiskapiunofficial.tech/api/v2.2/films?' + query,
                function (json) {
                    var film = json && json.items && json.items[0];
                    callback(film ? (film.kinopoiskId || film.filmId || null) : null);
                },
                function () {
                    callback(null);
                },
                false,
                { headers: { 'X-API-KEY': KP_API_KEY } }
            );
        };

        this.requestPlayers = function (attempts, index) {
            if (!attempts.length) return this.empty(tr('trout_no_kp'));
            if (index >= attempts.length) return this.empty(tr('trout_nolink'));

            network.clear();
            network.silent(
                API_HOST + '/api/players?' + attempts[index],
                function (json) {
                    var data = Array.isArray(json) ? json : ((json && json.data) || []);
                    var list = _this.parseAll(data);

                    if (list.length) {
                        items = list;
                        _this.build();
                    } else {
                        _this.requestPlayers(attempts, index + 1);
                    }
                },
                function () {
                    _this.requestPlayers(attempts, index + 1);
                }
            );
        };

        /**
         * Источники из API: [{ type, iframeUrl, translations: [{ name, quality, iframeUrl }] }].
         * Записи без настоящей ссылки (например, Vibix с data-атрибутами) пропускаются.
         */
        this.parseAll = function (data) {
            var list = [];
            var defVoice = tr('trout_default_voice');

            (data || []).forEach(function (balanser) {
                if (!balanser || !balanser.type) return;
                if (!isAllowedBalanser(balanser.type)) return;

                var type = balanser.type;
                var translations = balanser.translations || [];

                if (!translations.length) {
                    if (isUrl(balanser.iframeUrl)) {
                        list.push({ voice: defVoice, quality: '', balanser: type, url: balanser.iframeUrl });
                    }
                    return;
                }

                translations.forEach(function (t) {
                    var link = t.iframeUrl || balanser.iframeUrl;
                    if (!isUrl(link)) return;

                    list.push({
                        voice: t.name || defVoice,
                        quality: t.quality || '',
                        balanser: type,
                        url: link
                    });
                });
            });

            return list;
        };

        // ----- фильтры -----

        this.build = function () {
            filter_items.balanser = [];

            items.forEach(function (el) {
                if (el.balanser && filter_items.balanser.indexOf(el.balanser) === -1) {
                    filter_items.balanser.push(el.balanser);
                }
            });

            filter_items.balanser.sort(function (a, b) {
                var ia = PREFERRED.indexOf(a);
                var ib = PREFERRED.indexOf(b);
                if (ia === -1) ia = 999;
                if (ib === -1) ib = 999;
                if (ia !== ib) return ia - ib;
                return a.localeCompare(b);
            });

            var saved = filter_items.balanser.indexOf(Lampa.Storage.get('trout_balanser', ''));
            choice.balanser = saved > -1 ? saved : 0;
            choice.voice = '';
            choice.quality = '';
            choice.season = 0;

            this.draw();
            this.loading(false);
        };

        // Списки «Перевод» и «Качество» из API под выбранный балансер
        this.updateLists = function () {
            var bal = filter_items.balanser[choice.balanser];
            var inBal = items.filter(function (el) { return el.balanser === bal; });

            filter_items.voice = [];
            inBal.forEach(function (el) {
                if (filter_items.voice.indexOf(el.voice) === -1) filter_items.voice.push(el.voice);
            });
            if (!choice.voice || filter_items.voice.indexOf(choice.voice) === -1) choice.voice = filter_items.voice[0];

            filter_items.quality = [];
            inBal.forEach(function (el) {
                if (el.voice !== choice.voice) return;
                if (el.quality && filter_items.quality.indexOf(el.quality) === -1) filter_items.quality.push(el.quality);
            });
            filter_items.quality.sort(function (a, b) {
                var ra = qualityRank(a);
                var rb = qualityRank(b);
                if (ra !== rb) return ra - rb;
                return a.localeCompare(b);
            });
            if (choice.quality && filter_items.quality.indexOf(choice.quality) === -1) choice.quality = '';

            return inBal;
        };

        // Источник (страница плеера), выбранный текущими фильтрами
        this.currentSource = function (inBal) {
            var byVoice = inBal.filter(function (el) { return el.voice === choice.voice; });
            var cand = byVoice;

            if (choice.quality) {
                var byQuality = byVoice.filter(function (el) { return el.quality === choice.quality; });
                if (byQuality.length) cand = byQuality;
            }
            return cand[0] || inBal[0];
        };

        this.setFilter = function (details) {
            var all = tr('trout_all');
            var balName = filter_items.balanser[choice.balanser] || '';
            var groups = [];

            groups.push({
                title: tr('trout_balanser'),
                subtitle: balName,
                stype: 'balanser',
                items: filter_items.balanser.map(function (name, i) {
                    return { title: name, index: i, selected: i === choice.balanser };
                })
            });

            groups.push({
                title: tr('trout_voice'),
                subtitle: choice.voice,
                stype: 'voice',
                items: filter_items.voice.map(function (name, i) {
                    return { title: name, index: i, selected: name === choice.voice };
                })
            });

            if (filter_items.quality.length) {
                groups.push({
                    title: tr('trout_quality'),
                    subtitle: choice.quality || all,
                    stype: 'quality',
                    items: [{ title: all, index: 0, selected: !choice.quality }].concat(
                        filter_items.quality.map(function (name, i) {
                            return { title: name, index: i + 1, selected: name === choice.quality };
                        })
                    )
                });
            }

            var summary = [balName, choice.voice];

            if (details && details.type === 'serial') {
                filter_items.season = details.seasons.map(function (s) {
                    return tr('trout_season') + ' ' + s.number;
                });
                if (choice.season >= filter_items.season.length) choice.season = 0;

                groups.push({
                    title: tr('trout_season'),
                    subtitle: filter_items.season[choice.season],
                    stype: 'season',
                    items: filter_items.season.map(function (name, i) {
                        return { title: name, index: i, selected: i === choice.season };
                    })
                });
                summary.push(filter_items.season[choice.season]);
            } else {
                filter_items.season = [];
            }

            if (choice.quality) summary.push(choice.quality);

            filter.set('filter', groups);
            filter.chosen('filter', [summary.join(' / ')]);
        };

        // ----- отрисовка -----

        this.addItem = function (title, sub, onEnter) {
            var item = Lampa.Template.get('trout_item', { title: title, quality: sub });

            item.on('hover:enter', onEnter);
            item.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });

            scroll.append(item);
        };

        this.addNote = function (text) {
            scroll.append($('<div class="trout-empty"></div>').text(text));
        };

        this.draw = function () {
            var inBal = this.updateLists();
            var src = this.currentSource(inBal);

            scroll.clear();
            last = false;

            if (!src) {
                this.setFilter(null);
                return this.addNote(tr('trout_nolink'));
            }

            var cached = detailsCache[src.url];

            if (!cached || !cached.done) {
                this.setFilter(null);
                this.addNote(tr('trout_loading_player'));

                getDetails(src.url, function () {
                    if (destroyed) return;
                    var cur = _this.currentSource(_this.updateLists());
                    if (cur && cur.url === src.url) {
                        _this.draw();
                        _this.start();
                    }
                });
                return;
            }

            this.setFilter(cached.data);

            if (!cached.data) return this.drawFailed(src, cached.diag);

            var sub = [src.quality, src.balanser].filter(Boolean).join(' · ');

            if (cached.data.type === 'serial') {
                var season = cached.data.seasons[choice.season] || cached.data.seasons[0];
                var list = season.episodes.map(function (ep) {
                    return { label: 'S' + season.number + ' / ' + ep.title, url: ep.url, iframe: ep.iframe, quality: ep.quality, subtitles: ep.subtitles };
                });

                season.episodes.forEach(function (ep, idx) {
                    var line = sub;
                    if (ep.voices && ep.voices.length) line += ' · ' + ep.voices.slice(0, 3).join(', ');
                    _this.addItem(ep.title, line, function () {
                        _this.playList(list, idx, src);
                    });
                });
            } else {
                var d = cached.data;
                var line = sub;
                if (d.voices && d.voices.length) line += ' · ' + d.voices.slice(0, 3).join(', ');

                var movieList = [{ label: src.voice, url: d.url, iframe: null, quality: d.quality, subtitles: d.subtitles }];
                this.addItem(tr('trout_watch'), line, function () {
                    _this.playList(movieList, 0, src);
                });
            }
        };

        this.drawFailed = function (src, diag) {
            this.addNote(tr(diag && diag.reason === 'fetch' ? 'trout_fail_fetch' : 'trout_fail_parse'));

            this.addItem(tr('trout_open_iframe'), src.balanser, function () {
                openIframe(src.url, src.balanser + ' / ' + src.voice);
            });

            if (diag) {
                this.addItem(tr('trout_diag'), diag.url, function () {
                    showDiag(diag);
                });
            }
        };

        // ----- воспроизведение -----

        this.stopLoading = function () {
            if (Lampa.Loading && typeof Lampa.Loading.stop === 'function') Lampa.Loading.stop();
        };

        this.playList = function (list, index, src) {
            var el = list[index];
            var movie = object.movie || {};
            var name = movie.title || movie.name || '';
            var base = name ? name + ' / ' : '';

            function toData(e) {
                var data = { title: base + e.label, url: e.url };
                if (e.quality) data.quality = e.quality;
                if (e.subtitles && e.subtitles.length) data.subtitles = e.subtitles;
                return data;
            }

            function launch(selected) {
                var playlist = [];
                var current = null;

                list.forEach(function (e) {
                    var entry = (e === el) ? selected : (e.url ? toData(e) : null);
                    if (!entry) return;
                    playlist.push(entry);
                    if (e === el) current = entry;
                });

                Lampa.Player.play(current);
                Lampa.Player.playlist(playlist);
            }

            if (el.url) return launch(toData(el));

            // у серии нет прямой ссылки — берём её со страницы серии
            var token = ++playToken;

            if (Lampa.Loading && typeof Lampa.Loading.start === 'function') {
                Lampa.Loading.start(function () {
                    playToken++;
                    _this.stopLoading();
                });
            }

            loadAndParse(el.iframe || src.url, 0, function (res) {
                if (token !== playToken) return;
                playToken++;
                _this.stopLoading();

                if (res.data && res.data.type === 'movie' && res.data.url) {
                    el.url = res.data.url;
                    el.quality = res.data.quality;
                    if (res.data.subtitles && res.data.subtitles.length) el.subtitles = res.data.subtitles;
                    launch(toData(el));
                } else {
                    Lampa.Noty.show(tr('trout_stream_failed'));
                    openIframe(el.iframe || src.url, base + el.label);
                }
            });
        };

        this.empty = function (msg) {
            scroll.clear();
            this.addNote(msg || '');
            this.loading(false);
        };

        // ----- жизненный цикл компонента -----

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show(tr('title_filter'), 'filter');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};

        this.render = function () {
            return files.render();
        };

        this.destroy = function () {
            destroyed = true;
            playToken++;
            this.stopLoading();
            closePlayer();
            network.clear();
            files.destroy();
            scroll.destroy();
            filter.destroy();
        };
    }

    Lampa.Component.add(PLUGIN_NAME, component);

    // ---------- кнопка в карточке фильма ----------

    function addButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var render = e.object.activity.render();
            if (render.find('.view--trout').length) return;

            var btn = $(
                '<div class="full-start__button selector view--trout">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M8 5v14l11-7L8 5z"/>' +
                    '</svg>' +
                    '<span>' + tr('trout_title') + '</span>' +
                '</div>'
            );

            btn.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: tr('trout_title'),
                    component: PLUGIN_NAME,
                    movie: e.data.movie,
                    page: 1
                });
            });

            var torrentBtn = render.find('.view--torrent');
            if (torrentBtn.length) {
                torrentBtn.after(btn);
            } else {
                render.find('.full-start-new__buttons, .full-start__buttons').first().append(btn);
            }
        });
    }

    function startPlugin() {
        if (window.appready) addButton();
        else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') addButton();
            });
        }
    }

    startPlugin();
})();
