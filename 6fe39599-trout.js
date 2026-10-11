(function () {
    'use strict';

    var PLUGIN_NAME = 'trout';
    var API_HOST = 'https://p.linkpp.ink';

    // Необязательно: ключ неофициального API Кинопоиска (kinopoiskapiunofficial.tech).
    // Нужен только если у карточки нет ID Кинопоиска: по нему плагин найдёт KP ID сам.
    var KP_API_KEY = '';

    // Какие балансеры показывать (пустой массив = все)
    var ALLOWED_BALANCERS = [];

    // Порядок сортировки балансеров в фильтре
    var PREFERRED = ['Alloha', 'Collaps', 'Vibix', 'Veoveo', 'Turbo'];

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
        trout_voice: { ru: 'Озвучка', uk: 'Озвучення', en: 'Voice' },
        trout_default_voice: { ru: 'По умолчанию', uk: 'За замовчуванням', en: 'Default' }
    });

    // ---------- стили (свои, не зависят от плагина online) ----------

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

    function normalizeUrl(url) {
        url = String(url || '');
        if (url.indexOf('//') === 0) return 'https:' + url;
        return url;
    }

    // ---------- плеер: iframe поверх интерфейса ----------

    var player = { layer: null, prev: null };

    function closePlayer() {
        if (!player.layer) return;
        player.layer.remove();
        player.layer = null;
        Lampa.Controller.toggle(player.prev || 'content');
    }

    function openPlayer(url, title) {
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
        var filter_items = { balanser: [], voice: [] };
        var choice = { balanser: 0, voice: 0 };

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
                        choice.voice = 0;
                        Lampa.Storage.set('trout_balanser', filter_items.balanser[b.index]);
                    }
                    if (a.stype === 'voice') {
                        choice.voice = b.index;
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

        // Порядок попыток: сначала KP ID, потом IMDb ID (если API его принимает)
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
         * Ожидаемый формат: [{ type, iframeUrl, translations: [{ name, quality, iframeUrl }] }]
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
                    if (balanser.iframeUrl) {
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
                    if (!link) return;

                    var voice = t.name || defVoice;

                    list.push({
                        title: voice,
                        quality: t.quality || '',
                        voice: voice,
                        balanser: type,
                        url: link
                    });
                });
            });

            return list;
        };

        // ----- фильтр и список -----

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

            // запоминаем последний выбранный балансер
            var saved = filter_items.balanser.indexOf(Lampa.Storage.get('trout_balanser', ''));
            choice.balanser = saved > -1 ? saved : 0;
            choice.voice = 0;

            this.draw();
            this.loading(false);
        };

        this.updateVoices = function () {
            var current = filter_items.balanser[choice.balanser];
            filter_items.voice = [];

            items.forEach(function (el) {
                if (el.balanser !== current) return;
                if (filter_items.voice.indexOf(el.voice) === -1) filter_items.voice.push(el.voice);
            });

            if (!filter_items.voice.length) filter_items.voice.push(tr('trout_default_voice'));
            if (choice.voice >= filter_items.voice.length) choice.voice = 0;
        };

        this.setFilter = function () {
            var balName = filter_items.balanser[choice.balanser] || '';
            var voiceName = filter_items.voice[choice.voice] || '';

            filter.set('filter', [
                {
                    title: tr('trout_balanser'),
                    subtitle: balName,
                    stype: 'balanser',
                    items: filter_items.balanser.map(function (name, i) {
                        return { title: name, index: i, selected: i === choice.balanser };
                    })
                },
                {
                    title: tr('trout_voice'),
                    subtitle: voiceName,
                    stype: 'voice',
                    items: filter_items.voice.map(function (name, i) {
                        return { title: name, index: i, selected: i === choice.voice };
                    })
                }
            ]);

            filter.chosen('filter', [balName + ' / ' + voiceName]);
        };

        this.draw = function () {
            this.updateVoices();
            this.setFilter();

            var balName = filter_items.balanser[choice.balanser];
            var voiceName = filter_items.voice[choice.voice];

            var filtered = items.filter(function (el) {
                return el.balanser === balName && el.voice === voiceName;
            });

            // запасной вариант: всё из выбранного балансера
            if (!filtered.length) {
                filtered = items.filter(function (el) {
                    return el.balanser === balName;
                });
            }

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

        this.play = function (element) {
            var movie = object.movie || {};
            var name = movie.title || movie.name || '';
            var title = (name ? name + ' / ' : '') + element.balanser + (element.voice ? ' / ' + element.voice : '');

            openPlayer(element.url, title);
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
