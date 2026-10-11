(function () {
    'use strict';

    var PLUGIN_NAME = 'trout';
    var PLUGIN_VERSION = 'iframe 1.3 (2026-10-11)';
    var API_HOST = 'https://p.linkpp.ink';

    // API ПоискКино (poiskkino.dev) — резолв KP ID по IMDb / названию
    var POISKKINO_HOST = 'https://api.poiskkino.dev';
    var POISKKINO_KEY = 'JQ0A9EN-HD64CVF-PGDWNV2-SGD77QB';

    // Какие балансеры показывать (пустой массив = все)
    var ALLOWED_BALANCERS = [];

    // Порядок балансеров в фильтре
    var PREFERRED = ['Alloha', 'Collaps', 'Vibix', 'Veoveo', 'Turbo'];

    // Порядок сортировки качества (чем раньше, тем выше)
    var QUALITY_RANK = ['4k', '2160', 'uhd', 'fullhd', 'fhd', '1080', 'bdrip', 'web-dl', 'webrip', 'hd', '720', 'dvdrip', 'sd', '480', '360', 'ts', 'cam'];

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
        trout_all: { ru: 'Все', uk: 'Усі', en: 'All' },
        trout_default_voice: { ru: 'По умолчанию', uk: 'За замовчуванням', en: 'Default' },
        trout_info: { ru: 'Информация', uk: 'Інформація', en: 'Info' }
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

    function findKinopoiskId(movie) {
        if (!movie) return null;
        if (movie.kinopoisk_id) return { id: movie.kinopoisk_id, from: 'kinopoisk_id' };
        if (movie.kp_id) return { id: movie.kp_id, from: 'kp_id' };
        if (movie.external_ids) {
            if (movie.external_ids.kinopoisk_id) return { id: movie.external_ids.kinopoisk_id, from: 'external_ids.kinopoisk_id' };
            if (movie.external_ids.kp_id) return { id: movie.external_ids.kp_id, from: 'external_ids.kp_id' };
        }
        if (movie.ids && movie.ids.kp) return { id: movie.ids.kp, from: 'ids.kp' };
        return null;
    }

    function getImdbId(movie) {
        if (!movie) return null;
        if (movie.imdb_id) return movie.imdb_id;
        if (movie.external_ids && movie.external_ids.imdb_id) return movie.external_ids.imdb_id;
        return null;
    }

    function getTmdbId(movie) {
        if (!movie) return null;
        if (movie.id && (movie.release_date || movie.first_air_date || movie.title || movie.name)) return movie.id;
        if (movie.external_ids && movie.external_ids.tmdb_id) return movie.external_ids.tmdb_id;
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

    function qualityRank(q) {
        var s = String(q || '').toLowerCase();
        for (var i = 0; i < QUALITY_RANK.length; i++) {
            if (s.indexOf(QUALITY_RANK[i]) > -1) return i;
        }
        return 999;
    }

    // ---------- iframe-плеер ----------

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

    function showText(title, text) {
        var html = $('<div class="trout-diag"></div>').text(text);
        var enabled = Lampa.Controller.enabled();
        var prev = (enabled && enabled.name) || 'content';

        Lampa.Modal.open({
            title: title,
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
        var filter_items = { balanser: [], voice: [], quality: [] };
        var choice = { balanser: 0, voice: '', quality: '' };

        var meta = {
            kpId: null,
            kpFrom: '',
            imdb: null,
            tmdb: null,
            attempts: [],
            usedAttempt: '',
            apiUrl: '',
            rawCount: 0,
            balancers: [],
            poiskkino: ''
        };

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
                    }
                    if (a.stype === 'voice') {
                        choice.voice = b.index === 0 ? '' : filter_items.voice[b.index - 1];
                    }
                    if (a.stype === 'quality') {
                        choice.quality = b.index === 0 ? '' : filter_items.quality[b.index - 1];
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

        // ----- поиск ссылок -----

        this.search = function () {
            var movie = object.movie;
            var kp = findKinopoiskId(movie);

            meta.imdb = getImdbId(movie);
            meta.tmdb = getTmdbId(movie);

            if (kp) {
                meta.kpId = kp.id;
                meta.kpFrom = kp.from;
                this.requestPlayers(this.buildAttempts(movie, kp.id), 0);
                return;
            }

            // Нет KP ID (типично для источника TMDB на ТВ) — резолвим через poiskkino.dev
            this.resolveKinopoiskId(movie, function (found, from) {
                if (found) {
                    meta.kpId = found;
                    meta.kpFrom = from || 'poiskkino.dev';
                }
                _this.requestPlayers(_this.buildAttempts(movie, found), 0);
            });
        };

        this.buildAttempts = function (movie, kp) {
            var attempts = [];
            // Сначала KP — API отдаёт полные ссылки (Collaps и др.)
            if (kp) attempts.push('kinopoisk=' + encodeURIComponent(kp));
            var imdb = getImdbId(movie);
            if (imdb) attempts.push('imdb=' + encodeURIComponent(imdb));
            meta.attempts = attempts.slice();
            return attempts;
        };

        /**
         * Резолв KP ID через api.poiskkino.dev
         * 1) по IMDb  2) по TMDB  3) по названию+году
         */
        this.resolveKinopoiskId = function (movie, callback) {
            if (!POISKKINO_KEY) {
                meta.poiskkino = 'нет ключа';
                return callback(null);
            }

            var imdb = getImdbId(movie);
            var tmdb = getTmdbId(movie);
            var title = (movie && (movie.original_title || movie.original_name || movie.title || movie.name)) || '';
            var date = (movie && (movie.release_date || movie.first_air_date)) || '';
            var year = String(date).slice(0, 4);

            var queries = [];

            if (imdb) {
                queries.push({
                    label: 'imdb ' + imdb,
                    url: POISKKINO_HOST + '/v1.5/movie?externalId.imdb=' + encodeURIComponent(imdb) +
                        '&limit=1&selectFields=id&selectFields=name&selectFields=externalId'
                });
            }
            if (tmdb) {
                queries.push({
                    label: 'tmdb ' + tmdb,
                    url: POISKKINO_HOST + '/v1.5/movie?externalId.tmdb=' + encodeURIComponent(tmdb) +
                        '&limit=1&selectFields=id&selectFields=name&selectFields=externalId'
                });
            }
            if (title) {
                var q = POISKKINO_HOST + '/v1.5/movie/search?query=' + encodeURIComponent(title) +
                    '&limit=5&selectFields=id&selectFields=name&selectFields=year&selectFields=externalId';
                queries.push({ label: 'search ' + title, url: q, year: year });
            }

            if (!queries.length) {
                meta.poiskkino = 'нет imdb/tmdb/названия';
                return callback(null);
            }

            var idx = 0;

            function next() {
                if (idx >= queries.length) {
                    meta.poiskkino = (meta.poiskkino || '') + ' | не найден';
                    return callback(null);
                }

                var q = queries[idx++];
                meta.poiskkino = q.label;

                network.clear();
                network.silent(
                    q.url,
                    function (json) {
                        var docs = (json && json.docs) || (json && json.films) || [];
                        if (!Array.isArray(docs)) docs = [];

                        var film = null;

                        if (q.year && docs.length > 1) {
                            for (var i = 0; i < docs.length; i++) {
                                if (String(docs[i].year || '') === String(q.year)) {
                                    film = docs[i];
                                    break;
                                }
                            }
                        }
                        if (!film) film = docs[0];

                        var id = film && (film.id || film.kinopoiskId || film.filmId);
                        if (id) {
                            meta.poiskkino = q.label + ' → ' + id;
                            return callback(id, 'poiskkino.dev (' + q.label + ')');
                        }
                        next();
                    },
                    function () {
                        next();
                    },
                    false,
                    {
                        headers: {
                            'X-API-KEY': POISKKINO_KEY,
                            'Accept': 'application/json'
                        }
                    }
                );
            }

            next();
        };

        this.requestPlayers = function (attempts, index) {
            if (!attempts.length) return this.empty(tr('trout_no_kp'));
            if (index >= attempts.length) return this.empty(tr('trout_nolink'));

            meta.apiUrl = API_HOST + '/api/players?' + attempts[index];
            meta.usedAttempt = attempts[index];

            network.clear();
            network.silent(
                meta.apiUrl,
                function (json) {
                    var data = Array.isArray(json) ? json : ((json && json.data) || []);
                    meta.rawCount = data.length;

                    var list = _this.parseAll(data);
                    log('API', meta.apiUrl, 'raw:', data.length, 'shown:', list.length);

                    if (list.length) {
                        items = list;
                        _this.build();
                    } else {
                        _this.requestPlayers(attempts, index + 1);
                    }
                },
                function (a, b) {
                    log('API error', meta.apiUrl, a && a.status, b);
                    _this.requestPlayers(attempts, index + 1);
                }
            );
        };

        this.parseAll = function (data) {
            var list = [];
            var defVoice = tr('trout_default_voice');
            meta.balancers = [];

            (data || []).forEach(function (balanser) {
                if (!balanser || !balanser.type) return;

                var type = balanser.type;
                var translations = balanser.translations || [];
                var info = { type: type, total: translations.length || 1, shown: 0, noUrl: 0, hidden: false };
                meta.balancers.push(info);

                if (!isAllowedBalanser(type)) {
                    info.hidden = true;
                    return;
                }

                if (!translations.length) {
                    if (isUrl(balanser.iframeUrl)) {
                        list.push({ voice: defVoice, quality: '', balanser: type, url: balanser.iframeUrl });
                        info.shown++;
                    } else {
                        info.noUrl++;
                    }
                    return;
                }

                translations.forEach(function (t) {
                    var link = t.iframeUrl || balanser.iframeUrl;
                    if (!isUrl(link)) {
                        info.noUrl++;
                        return;
                    }

                    list.push({
                        voice: t.name || defVoice,
                        quality: t.quality || '',
                        balanser: type,
                        url: link
                    });
                    info.shown++;
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

            choice.balanser = 0;
            choice.voice = '';
            choice.quality = '';

            this.draw();
            this.loading(false);
        };

        this.updateLists = function () {
            var bal = filter_items.balanser[choice.balanser];
            var inBal = items.filter(function (el) { return el.balanser === bal; });

            filter_items.voice = [];
            inBal.forEach(function (el) {
                if (filter_items.voice.indexOf(el.voice) === -1) filter_items.voice.push(el.voice);
            });
            if (choice.voice && filter_items.voice.indexOf(choice.voice) === -1) choice.voice = '';

            var inVoice = inBal.filter(function (el) {
                return !choice.voice || el.voice === choice.voice;
            });

            filter_items.quality = [];
            inVoice.forEach(function (el) {
                if (el.quality && filter_items.quality.indexOf(el.quality) === -1) filter_items.quality.push(el.quality);
            });
            filter_items.quality.sort(function (a, b) {
                var ra = qualityRank(a);
                var rb = qualityRank(b);
                if (ra !== rb) return ra - rb;
                return a.localeCompare(b);
            });
            if (choice.quality && filter_items.quality.indexOf(choice.quality) === -1) choice.quality = '';

            return inVoice;
        };

        this.setFilter = function () {
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
                subtitle: choice.voice || all,
                stype: 'voice',
                items: [{ title: all, index: 0, selected: !choice.voice }].concat(
                    filter_items.voice.map(function (name, i) {
                        return { title: name, index: i + 1, selected: name === choice.voice };
                    })
                )
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

            var summary = [balName];
            if (choice.voice) summary.push(choice.voice);
            if (choice.quality) summary.push(choice.quality);

            filter.set('filter', groups);
            filter.chosen('filter', [summary.join(' / ')]);
        };

        this.addItem = function (title, sub, onEnter) {
            var item = Lampa.Template.get('trout_item', { title: title, quality: sub });

            item.on('hover:enter', onEnter);
            item.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });

            scroll.append(item);
        };

        this.draw = function () {
            var inVoice = this.updateLists();
            this.setFilter();

            var filtered = inVoice.filter(function (el) {
                return !choice.quality || el.quality === choice.quality;
            });

            scroll.clear();
            last = false;

            filtered.forEach(function (element) {
                var sub = [];
                if (element.quality) sub.push(element.quality);
                sub.push(element.balanser);

                _this.addItem(element.voice, sub.join(' · '), function () {
                    _this.play(element);
                });
            });

            this.addItem(tr('trout_info'), 'Trout · ' + PLUGIN_VERSION, function () {
                showText(tr('trout_info'), _this.infoText());
            });
        };

        this.infoText = function () {
            var lines = [];
            var manifest = Lampa.Manifest || {};

            lines.push('Версия плагина: ' + PLUGIN_VERSION);
            lines.push('Lampa: ' + (manifest.app_version || '?') + (manifest.css_version ? ' (css ' + manifest.css_version + ')' : ''));
            lines.push('Устройство: ' + navigator.userAgent);
            lines.push('Окно: ' + window.innerWidth + 'x' + window.innerHeight);
            lines.push('Источник данных Lampa: ' + (Lampa.Storage.get('source', '?')) + ', язык: ' + (Lampa.Storage.get('language', '?')));
            lines.push('');
            lines.push('Фильм: ' + ((object.movie && (object.movie.title || object.movie.name)) || '?') + ' (TMDB id ' + ((object.movie && object.movie.id) || '?') + ')');
            lines.push('KP ID: ' + (meta.kpId || 'нет') + (meta.kpFrom ? ' (из ' + meta.kpFrom + ')' : ''));
            lines.push('IMDb: ' + (meta.imdb || 'нет'));
            lines.push('TMDB: ' + (meta.tmdb || 'нет'));
            lines.push('PoiskKino: ' + (meta.poiskkino || '—'));
            lines.push('Запрос к API: ' + (meta.apiUrl || '—'));
            lines.push('Ответ API: балансеров ' + meta.rawCount);

            meta.balancers.forEach(function (b) {
                var line = ' - ' + b.type + ': записей ' + b.total + ', показано ' + b.shown;
                if (b.noUrl) line += ', без ссылки ' + b.noUrl;
                if (b.hidden) line += ', скрыт ALLOWED_BALANCERS';
                lines.push(line);
            });

            lines.push('');
            lines.push('ALLOWED_BALANCERS: ' + (ALLOWED_BALANCERS.length ? ALLOWED_BALANCERS.join(', ') : 'все'));
            lines.push('Показано элементов: ' + items.length);

            return lines.join('\n');
        };

        this.play = function (element) {
            var movie = object.movie || {};
            var name = movie.title || movie.name || '';
            var title = (name ? name + ' / ' : '') + element.balanser + (element.voice ? ' / ' + element.voice : '');

            openIframe(element.url, title);
        };

        this.empty = function (msg) {
            scroll.clear();
            scroll.append($('<div class="trout-empty"></div>').text(msg || ''));
            this.addItem(tr('trout_info'), 'Trout · ' + PLUGIN_VERSION, function () {
                showText(tr('trout_info'), _this.infoText());
            });
            this.loading(false);
        };

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
                    else filter.show(tr('title_filter') || 'Фильтр', 'filter');
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
