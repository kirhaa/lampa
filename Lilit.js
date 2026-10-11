(function () {
    'use strict';

    var PLUGIN_NAME = 'Lilit';
    var API_HOST = 'https://p.linkpp.ink';

    // Необязательно: ключ неофициального API Кинопоиска (kinopoiskapiunofficial.tech).
    // Нужен, если у карточки нет ID Кинопоиска: по нему плагин найдёт его сам.
    var KP_API_KEY = '';

    // Необязательно: CORS-прокси для загрузки страниц плееров в браузерной версии Lampa.
    // Формат: префикс, к которому дописывается полный URL. Пример: 'https://my-proxy.example/?url='
    var CORS_PROXY = '';

    // Какие балансеры показывать (пустой массив = все)
    var ALLOWED_BALANCERS = [];

    // Порядок сортировки балансеров в фильтре
    var PREFERRED = ['Alloha', 'Collaps', 'Vibix', 'Veoveo', 'Turbo'];

    // Порядок сортировки качества (чем раньше, тем выше)
    var QUALITY_RANK = ['4k', '2160', 'uhd', 'fullhd', 'fhd', '1080', 'bdrip', 'web-dl', 'webrip', 'hd', '720', 'dvdrip', 'sd', '480', '360', 'ts', 'cam'];

    var RESOLVE_TIMEOUT = 15000;

    if (window[PLUGIN_NAME + '_ready']) return;
    window[PLUGIN_NAME + '_ready'] = true;

    Lampa.Lang.add({
        trout_title: { ru: 'Lilit', uk: 'Lilit', en: 'Lilit' },
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
        trout_direct_failed: {
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
        '.trout-empty{padding:2em;text-align:center;opacity:.7}' +
        '.trout-player{position:fixed;left:0;top:0;width:100%;height:100%;z-index:9999;background:#000}' +
        '.trout-player iframe{width:100%;height:100%;border:0}' +
        '.trout-player__close{position:absolute;top:.6em;right:.6em;z-index:2;padding:.4em .9em;background:rgba(0,0,0,.65);color:#fff;border-radius:.5em;font-size:1.4em;cursor:pointer}' +
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

    // ---------- получение прямого потока из страницы плеера ----------

    function fetchText(url, ok, fail) {
        var target = CORS_PROXY ? CORS_PROXY + encodeURIComponent(url) : url;
        var net = new Lampa.Reguest();
        var finished = false;

        function success(text) {
            if (finished) return;
            finished = true;
            ok(typeof text === 'string' ? text : JSON.stringify(text));
        }

        function failure() {
            if (finished) return;
            finished = true;
            fail();
        }

        function viaSilent() {
            net.silent(target, success, failure, false, { dataType: 'text', timeout: RESOLVE_TIMEOUT });
        }

        if (typeof net['native'] === 'function') {
            net['native'](target, success, function () {
                if (finished) return;
                viaSilent();
            }, false, { dataType: 'text', timeout: RESOLVE_TIMEOUT });
        } else {
            viaSilent();
        }
    }

    function unescapeText(s) {
        return String(s)
            .replace(/\\\//g, '/')
            .replace(/\\u0026/g, '&')
            .replace(/&amp;/g, '&');
    }

    /**
     * Ищет в HTML прямой поток: сначала карту качеств mp4 вида [1080p]url,
     * потом m3u8, потом любой mp4.
     */
    function findStream(html) {
        var text = unescapeText(html);
        var m;

        // карта качеств: [1080p]https://...mp4
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

    function resolveStream(url, callback, depth) {
        depth = depth || 0;
        var target = normalizeUrl(url);

        fetchText(target, function (html) {
            var found = findStream(html);

            if (found) {
                log('stream found', found.type, found.url);
                return callback(found);
            }

            // иногда нужный плеер вложен ещё в один iframe
            if (depth < 1) {
                var inner = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (inner) {
                    log('following inner iframe', inner[1]);
                    return resolveStream(absoluteUrl(unescapeText(inner[1]), target), callback, depth + 1);
                }
            }

            log('stream not found in', target, '(html length ' + html.length + ')');
            callback(null);
        }, function () {
            log('failed to load player page', target);
            callback(null);
        });
    }

    // ---------- запасной вариант: iframe поверх интерфейса ----------

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

    // ---------- компонент ----------

    function component(object) {
        var _this = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var items = [];
        var last = false;
        var playToken = 0;
        var filter_items = { balanser: [], voice: [], quality: [] };
        // voice и quality: '' означает «Все»
        var choice = { balanser: 0, voice: '', quality: '' };

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
                        Lampa.Storage.set('trout_balanser', filter_items.balanser[b.index]);
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
         * Разбор балансеров из ответа API.
         * Формат: [{ type, iframeUrl, translations: [{ name, quality, iframeUrl }] }]
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
                        list.push({
                            title: type,
                            quality: '',
                            voice: defVoice,
                            balanser: type,
                            url: balanser.iframeUrl
                        });
                    }
                    return;
                }

                translations.forEach(function (t) {
                    var link = t.iframeUrl || balanser.iframeUrl;
                    if (!isUrl(link)) return;

                    list.push({
                        title: t.name || type,
                        quality: t.quality || '',
                        voice: t.name || defVoice,
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

            this.draw();
            this.loading(false);
        };

        // Пересчёт списков «Перевод» и «Качество» под выбранный балансер
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

            filter.set('filter', groups);

            var summary = [balName];
            if (choice.voice) summary.push(choice.voice);
            if (choice.quality) summary.push(choice.quality);
            filter.chosen('filter', [summary.join(' / ')]);
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

                var item = Lampa.Template.get('trout_item', {
                    title: element.title,
                    quality: sub.join(' · ')
                });

                item.on('hover:enter', function () {
                    _this.play(element);
                });

                item.on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(item);
            });
        };

        // ----- воспроизведение -----

        this.stopLoading = function () {
            if (Lampa.Loading && typeof Lampa.Loading.stop === 'function') Lampa.Loading.stop();
        };

        this.play = function (element) {
            var movie = object.movie || {};
            var name = movie.title || movie.name || '';
            var title = (name ? name + ' / ' : '') + element.balanser + (element.voice ? ' / ' + element.voice : '');
            var token = ++playToken;

            if (Lampa.Loading && typeof Lampa.Loading.start === 'function') {
                Lampa.Loading.start(function () {
                    playToken++;
                    _this.stopLoading();
                });
            }

            var timer = setTimeout(function () {
                if (token !== playToken) return;
                finish(null);
            }, RESOLVE_TIMEOUT + 3000);

            function finish(found) {
                clearTimeout(timer);
                if (token !== playToken) return;
                playToken++;
                _this.stopLoading();

                if (found && found.url) {
                    var data = { title: title, url: found.url };
                    if (found.quality) data.quality = found.quality;

                    Lampa.Player.play(data);
                    Lampa.Player.playlist([data]);
                } else {
                    Lampa.Noty.show(tr('trout_direct_failed'));
                    openIframe(element.url, title);
                }
            }

            resolveStream(element.url, finish);
        };

        this.empty = function (msg) {
            scroll.clear();
            scroll.append($('<div class="trout-empty"></div>').text(msg || ''));
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
