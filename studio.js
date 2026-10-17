(function () {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.ready();
        tg.expand();
        if (tg.isVersionAtLeast && tg.isVersionAtLeast("6.1")) {
            if (tg.setHeaderColor) tg.setHeaderColor("#f6f1e8");
            if (tg.setBackgroundColor) tg.setBackgroundColor("#e4ddd2");
        }
    }

    var form = document.getElementById("brief");
    var symbolInput = document.getElementById("symbol");
    var signatureInput = document.getElementById("signature");
    var entryInput = document.getElementById("entry");
    var markInput = document.getElementById("mark");
    var marginInput = document.getElementById("margin");
    var balanceInput = document.getElementById("balance");
    var balanceLine = document.getElementById("balanceLine");
    var levReadout = document.getElementById("levReadout");
    var levChips = document.getElementById("levChips");
    var tally = document.getElementById("tally");
    var tallyPnl = document.getElementById("tallyPnl");
    var tallyRoi = document.getElementById("tallyRoi");
    var tallySize = document.getElementById("tallySize");
    var sendBtn = document.getElementById("sendBtn");
    var sendHint = document.getElementById("sendHint");
    var notice = document.getElementById("notice");

    var side = "long";
    var marginKind = "cross";
    var leverage = 20;
    var position = "closed";
    var showQuote = false;
    var background = "both";
    var cardView = "roi";
    var bybitBackground = "all";
    var termHoursInput = document.getElementById("termHours");
    var termMinutesInput = document.getElementById("termMinutes");
    var bybitTerm = document.getElementById("bybitTerm");
    var platesReady = false;
    var catalogPlates = [];
    var step = "exchange";
    var exchangeId = "";
    var kindId = "";
    var KINDS = {
        bingx: [{ id: "card", title: "Карточка позиции", note: "Закрытая или активная. Медведь и бык." }],
        bybit: [{ id: "card", title: "Карточка позиции", note: "ROI, реализованный P&L или P&L со сроком." }]
    };
    var sending = false;
    var apiMode = document.body.hasAttribute("data-studio-api");
    var apiBase = document.body.getAttribute("data-studio-api") || "";

    function say(text) {
        notice.hidden = !text;
        notice.textContent = text || "";
        if (text) notice.scrollIntoView({ block: "nearest" });
    }

    function bindSwitch(root, apply) {
        var buttons = root.querySelectorAll("button");
        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                buttons.forEach(function (item) { item.classList.remove("is-on"); });
                button.classList.add("is-on");
                apply(button.getAttribute("data-value"));
            });
        });
    }

    bindSwitch(document.getElementById("sideSwitch"), function (value) {
        side = value;
        refreshTally();
    });
    bindSwitch(document.getElementById("marginSwitch"), function (value) {
        marginKind = value;
        balanceLine.hidden = value !== "cross";
    });
    bindSwitch(document.getElementById("positionSwitch"), function (value) {
        position = value;
        var note = document.getElementById("positionNote");
        note.textContent = value === "open"
            ? "На кадре будет «Позиция активна» и «Последняя цена»."
            : "На кадре будет «Закрыто» и «Цена закрытия».";
    });
    bindSwitch(document.getElementById("quoteSwitch"), function (value) {
        showQuote = value === "on";
    });
    bindSwitch(document.getElementById("bgSwitch"), function (value) {
        background = value;
    });
    function bybitCopy(value) {
        if (value === "pnl") {
            return "Крупная цифра — реализованный PnL в USDT, без знака процента.";
        }
        if (value === "term") {
            return "Крупная цифра — P&L без плюса. Бейдж только сторона, цены средние, внизу срок.";
        }
        return "Крупная цифра — процент ROI. Плечо пишется как 70.0X.";
    }

    bindSwitch(document.getElementById("bybitMode"), function (value) {
        cardView = value;
        document.getElementById("bybitNote").textContent = bybitCopy(value);
        bybitTerm.hidden = value !== "term";
    });
    document.getElementById("bybitBg").addEventListener("click", function (event) {
        var chip = event.target.closest("button");
        if (!chip) return;
        bybitBackground = chip.getAttribute("data-bg");
        document.querySelectorAll("#bybitBg button").forEach(function (item) {
            item.classList.toggle("is-on", item === chip);
        });
    });

    function setLeverage(value) {
        leverage = Math.min(400, Math.max(1, value));
        levReadout.textContent = leverage + "×";
        levChips.querySelectorAll("button").forEach(function (chip) {
            chip.classList.toggle("is-on", Number(chip.getAttribute("data-lev")) === leverage);
        });
        refreshTally();
    }

    document.getElementById("levDown").addEventListener("click", function () {
        setLeverage(leverage - 1);
    });
    document.getElementById("levUp").addEventListener("click", function () {
        setLeverage(leverage + 1);
    });
    levChips.addEventListener("click", function (event) {
        var chip = event.target.closest("button");
        if (!chip) return;
        setLeverage(Number(chip.getAttribute("data-lev")));
    });

    function parseAmount(input) {
        var raw = input.value.trim().replace(/\s/g, "").replace(",", ".");
        if (!raw) return null;
        var value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) return null;
        return raw;
    }

    function parseCount(input, max) {
        var raw = input.value.trim();
        if (!raw) return 0;
        if (!/^\d+$/.test(raw)) return null;
        var value = Number(raw);
        if (value > max) return null;
        return value;
    }

    function formatPreview(value, digits) {
        var sign = value > 0 ? "+" : value < 0 ? "-" : "";
        var abs = Math.abs(value);
        var parts = abs.toFixed(digits).split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
        return sign + parts[0] + "," + parts[1];
    }

    function refreshTally() {
        var entry = Number(parseAmount(entryInput));
        var mark = Number(parseAmount(markInput));
        var margin = Number(parseAmount(marginInput));
        if (!entry || !mark || !margin) {
            tally.hidden = true;
            return;
        }
        var notional = margin * leverage;
        var pnl = side === "long"
            ? ((mark - entry) / entry) * notional
            : ((entry - mark) / entry) * notional;
        var roi = (pnl / margin) * 100;
        var tone = pnl >= 0 ? "up" : "down";
        tally.hidden = false;
        tallyPnl.textContent = formatPreview(pnl, 2);
        tallyRoi.textContent = formatPreview(roi, 2) + "%";
        tallySize.textContent = formatPreview(Math.abs(notional), 2).replace("+", "");
        tallyPnl.className = tone;
        tallyRoi.className = tone;
        tallySize.className = "";
    }

    [entryInput, markInput, marginInput].forEach(function (input) {
        input.addEventListener("input", function () {
            input.classList.remove("is-invalid");
            say("");
            refreshTally();
        });
    });
    [termHoursInput, termMinutesInput].forEach(function (input) {
        input.addEventListener("input", function () {
            input.classList.remove("is-invalid");
            say("");
        });
    });
    symbolInput.addEventListener("input", function () {
        symbolInput.classList.remove("is-invalid");
        say("");
    });

    function kindsFor(id) {
        return KINDS[id] || [{ id: "card", title: "Карточка позиции", note: "" }];
    }

    function plateById(id) {
        for (var i = 0; i < catalogPlates.length; i++) {
            if (catalogPlates[i].id === id) return catalogPlates[i];
        }
        return null;
    }

    function kindById(id) {
        var kinds = kindsFor(exchangeId);
        for (var i = 0; i < kinds.length; i++) {
            if (kinds[i].id === id) return kinds[i];
        }
        return kinds[0];
    }

    function renderExchanges() {
        var list = document.getElementById("exchangeList");
        list.innerHTML = "";
        catalogPlates.forEach(function (item) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "pick";
            var title = document.createElement("strong");
            title.textContent = item.title || item.id;
            var note = document.createElement("span");
            note.textContent = kindsFor(item.id).length === 1
                ? kindsFor(item.id)[0].note
                : "Несколько карточек";
            button.appendChild(title);
            button.appendChild(note);
            button.addEventListener("click", function () {
                exchangeId = item.id;
                kindId = "";
                say("");
                showStep("kind");
            });
            list.appendChild(button);
        });
    }

    function renderKinds() {
        var list = document.getElementById("kindList");
        list.innerHTML = "";
        kindsFor(exchangeId).forEach(function (kind) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "pick";
            var title = document.createElement("strong");
            title.textContent = kind.title;
            var note = document.createElement("span");
            note.textContent = kind.note || "";
            button.appendChild(title);
            if (kind.note) button.appendChild(note);
            button.addEventListener("click", function () {
                kindId = kind.id;
                say("");
                showStep("form");
            });
            list.appendChild(button);
        });
    }

    function crumbButton(label, target) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", function () {
            say("");
            showStep(target);
        });
        return button;
    }

    function renderCrumbs() {
        var nav = document.getElementById("crumbs");
        nav.innerHTML = "";
        if (step === "exchange" || !exchangeId) {
            nav.hidden = true;
            return;
        }
        nav.hidden = false;
        var plate = plateById(exchangeId);
        nav.appendChild(crumbButton(plate ? (plate.title || exchangeId) : exchangeId, "exchange"));
        if (step === "form") {
            var sep = document.createElement("span");
            sep.className = "sep";
            sep.textContent = "/";
            nav.appendChild(sep);
            var kind = kindById(kindId);
            nav.appendChild(crumbButton(kind.title, "kind"));
            var sep2 = document.createElement("span");
            sep2.className = "sep";
            sep2.textContent = "/";
            nav.appendChild(sep2);
            var now = document.createElement("span");
            now.className = "now";
            now.textContent = "Параметры";
            nav.appendChild(now);
        }
    }

    function showStep(next) {
        step = next;
        document.getElementById("screenExchange").hidden = next !== "exchange";
        document.getElementById("screenKind").hidden = next !== "kind";
        form.hidden = next !== "form";
        var title = document.getElementById("stepTitle");
        var lede = document.getElementById("stepLede");
        if (next === "exchange") {
            title.textContent = "Биржа";
            lede.textContent = "Одна биржа за раз. Карточка уйдёт в чат.";
        } else if (next === "kind") {
            renderKinds();
            title.textContent = "Карточка";
            lede.textContent = kindsFor(exchangeId).length === 1
                ? "Пока здесь одна карточка."
                : "Выберите, что собрать.";
        } else {
            title.textContent = "Параметры";
            lede.textContent = "Заполните позицию. Готовый кадр вернётся в чат.";
            syncCardState();
        }
        renderCrumbs();
        window.scrollTo(0, 0);
    }

    function syncCardState() {
        document.getElementById("cardState").hidden = exchangeId !== "bingx";
        document.getElementById("bybitState").hidden = exchangeId !== "bybit";
    }

    var catalogUrl = apiMode ? apiBase + "/api/catalog" : "catalog.json";
    fetch(catalogUrl, { cache: "no-store" })
        .then(function (response) {
            if (!response.ok) throw new Error("catalog");
            return response.json();
        })
        .then(function (data) {
            catalogPlates = Array.isArray(data.plates) ? data.plates : [];
            platesReady = catalogPlates.length > 0;
            if (!platesReady) {
                document.getElementById("catalogError").hidden = false;
                return;
            }
            renderExchanges();
            showStep("exchange");
        })
        .catch(function () {
            platesReady = false;
            document.getElementById("catalogError").hidden = false;
        });

    function buildBrief() {
        var ok = true;
        [symbolInput, entryInput, markInput, marginInput].forEach(function (input) {
            input.classList.remove("is-invalid");
        });

        var symbol = symbolInput.value.trim().toUpperCase();
        if (!symbol) {
            symbolInput.classList.add("is-invalid");
            ok = false;
        }
        var entry = parseAmount(entryInput);
        var mark = parseAmount(markInput);
        var margin = parseAmount(marginInput);
        if (!entry) { entryInput.classList.add("is-invalid"); ok = false; }
        if (!mark) { markInput.classList.add("is-invalid"); ok = false; }
        if (!margin) { marginInput.classList.add("is-invalid"); ok = false; }

        if (!exchangeId) {
            say("Сначала выберите биржу.");
            return null;
        }
        if (!ok) {
            say("Проверьте выделенные поля.");
            return null;
        }

        var brief = {
            symbol: symbol,
            side: side,
            leverage: leverage,
            entry_price: entry,
            mark_price: mark,
            margin: margin,
            margin_kind: marginKind,
            plates: [exchangeId]
        };
        var signature = signatureInput.value.trim();
        if (signature) brief.signature = signature;
        if (marginKind === "cross") {
            var balance = parseAmount(balanceInput);
            if (balance) brief.balance = balance;
        }
        var backgrounds = [];
        if (exchangeId === "bingx") {
            brief.position = position;
            brief.show_quote = showQuote;
            backgrounds = backgrounds.concat(background === "both" ? ["bear", "bull"] : [background]);
        }
        if (exchangeId === "bybit") {
            brief.card_view = cardView;
            if (cardView === "term") {
                var hours = parseCount(termHoursInput, 99999);
                var minutes = parseCount(termMinutesInput, 59);
                if (hours === null) termHoursInput.classList.add("is-invalid");
                if (minutes === null) termMinutesInput.classList.add("is-invalid");
                if (hours === null || minutes === null) {
                    say("Срок: часы от 0, минуты от 0 до 59.");
                    return null;
                }
                brief.duration_hours = hours;
                brief.duration_minutes = minutes;
            }
            var bybitBgs = bybitBackground === "all"
                ? ["rocket", "wallet", "money_bag", "magnifying_glass"]
                : [bybitBackground];
            backgrounds = backgrounds.concat(bybitBgs);
        }
        if (backgrounds.length) brief.backgrounds = backgrounds;
        return brief;
    }

    function finish(label) {
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = label;
    }

    function sendViaTelegram(brief) {
        if (!tg || !tg.sendData) {
            say("Откройте студию кнопкой под полем ввода в чате с ботом.");
            finish("Отправить в чат");
            return;
        }
        sendBtn.textContent = "Отправлено";
        try {
            tg.sendData(JSON.stringify(brief));
        } catch (error) {
            say(error.message || "Не удалось отправить данные.");
            finish("Отправить в чат");
            return;
        }
        setTimeout(function () { finish("Отправить в чат"); }, 4000);
    }

    function sendViaApi(brief) {
        var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        if (!user || !user.id) {
            say("Откройте студию кнопкой под полем ввода в чате с ботом.");
            finish("Отправить в чат");
            return;
        }
        sendBtn.textContent = "Собираю";
        fetch(apiBase + "/api/compose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                brief: brief,
                user_id: user.id,
                init_data: tg.initData || ""
            })
        })
            .then(function (response) {
                return response.json().then(function (body) {
                    return { ok: response.ok, body: body };
                });
            })
            .then(function (result) {
                if (result.body && result.body.ok) {
                    sendBtn.textContent = "В чате";
                    say("");
                    setTimeout(function () { if (tg && tg.close) tg.close(); }, 900);
                    setTimeout(function () { finish("Отправить в чат"); }, 4000);
                    return;
                }
                say((result.body && result.body.error) || "Не удалось собрать кадр.");
                finish("Отправить в чат");
            })
            .catch(function () {
                say("Нет связи с ботом.");
                finish("Отправить в чат");
            });
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (sending || sendBtn.disabled) return;
        say("");
        var brief = buildBrief();
        if (!brief) return;
        sending = true;
        sendBtn.disabled = true;
        if (apiMode) sendViaApi(brief);
        else sendViaTelegram(brief);
    });
})();
