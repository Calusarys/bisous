(function () {
  "use strict";

  // ---------- Carte ----------
  var carte = L.map("carte", { zoomControl: false, minZoom: 4, maxZoom: 19, zoomSnap: 0.5 }).setView([47.6, -1.2], 7);
  L.control.zoom({ position: "topright", zoomInTitle: "Zoomer", zoomOutTitle: "Dézoomer" }).addTo(carte);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">les contributeurs OpenStreetMap</a>'
  }).addTo(carte);

  var coeurSvg = function (taille, couleur) {
    return '<svg width="' + taille + '" height="' + taille + '" viewBox="0 0 24 24" aria-hidden="true"><path fill="' + couleur + '" stroke="#2a0f1c" stroke-width="1" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.5.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>';
  };
  var iconeCoeur = L.divIcon({ className: "coeur", html: coeurSvg(26, "#ff5d7d"), iconSize: [26, 26], iconAnchor: [13, 22], popupAnchor: [0, -18] });
  var grappes = L.markerClusterGroup({
    maxClusterRadius: 42, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
    iconCreateFunction: function (g) {
      var n = g.getChildCount(), t = n < 10 ? 36 : n < 50 ? 44 : 52;
      return L.divIcon({ className: "grappe", html: coeurSvg(t, "#ff7d97") + "<span>" + n + "</span>", iconSize: [t, t], iconAnchor: [t / 2, t / 2] });
    }
  }).addTo(carte);

  function echap(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function dateFr(debut, fin) {
    if (!debut) return "";
    var a = debut.slice(0, 10).split("-"), j = +a[2], m = +a[1] - 1, y = a[0];
    if (fin && fin.slice(0, 10) !== debut.slice(0, 10)) {
      var b = fin.slice(0, 10).split("-");
      if (b[0] === y && +b[1] - 1 === m) return j + "–" + (+b[2]) + " " + mois[m] + " " + y;
      return j + " " + mois[m] + " " + y + " – " + (+b[2]) + " " + mois[+b[1] - 1] + " " + b[0];
    }
    return j + " " + mois[m] + " " + y;
  }
  function htmlBulle(b) {
    var h = '<div class="bulle"><h2>' + echap(b.nom) + "</h2>";
    if (b.debut) h += '<div class="date">' + echap(dateFr(b.debut, b.fin)) + "</div>";
    if (b.adresse && b.adresse !== b.nom) h += '<div class="adresse">' + echap(b.adresse) + "</div>";
    return h + "</div>";
  }

  function afficher(baisers) {
    baisers.sort(function (a, b) { return a.debut < b.debut ? 1 : -1; });
    var parLieu = new Map();
    baisers.forEach(function (b) {
      var cle = b.lat.toFixed(5) + "," + b.lon.toFixed(5);
      if (!parLieu.has(cle)) parLieu.set(cle, []);
      parLieu.get(cle).push(b);
    });
    var marqueurs = [];
    parLieu.forEach(function (liste) {
      var m = L.marker([liste[0].lat, liste[0].lon], { icon: iconeCoeur, title: liste[0].nom, alt: liste[0].nom });
      var html = liste.map(htmlBulle).join("");
      m.bindPopup(liste.length > 1 ? '<div class="liste-bulles">' + html + "</div>" : html, { maxWidth: 280 });
      marqueurs.push(m);
    });
    grappes.clearLayers();
    grappes.addLayers(marqueurs);
    var dates = baisers.map(function (b) { return b.debut; }).filter(Boolean).sort();
    document.getElementById("compte").innerHTML = "<b>" + baisers.length + "</b> baiser" + (baisers.length > 1 ? "s" : "") +
      " · " + parLieu.size + " endroit" + (parLieu.size > 1 ? "s" : "") +
      (dates.length ? " · depuis " + echap(dateFr(dates[0])) : "");
    if (marqueurs.length) carte.fitBounds(L.latLngBounds(baisers.map(function (b) { return [b.lat, b.lon]; })), { padding: [40, 40], maxZoom: 13 });
  }

  // ---------- Code et déchiffrement ----------
  function deb64(s) { var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  var donnees = null;
  var champ = document.getElementById("code"), erreur = document.getElementById("code-erreur"), bouton = document.getElementById("code-ok"), porte = document.getElementById("porte");

  fetch("data.json", { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("absent");
    return r.json();
  }).then(function (d) { donnees = d; essaiMemo(); }, function () {
    erreur.textContent = "La carte n'a pas encore été synchronisée avec Notion.";
  });

  function ouvrir(code) {
    if (!donnees) { erreur.textContent = "La carte se prépare, réessaie dans un instant."; return; }
    if (!window.crypto || !crypto.subtle) { erreur.textContent = "Ce navigateur ne sait pas ouvrir la carte. Essaie avec Safari ou Chrome à jour."; return; }
    bouton.disabled = true; bouton.textContent = "Vérification…"; erreur.textContent = "";
    crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: deb64(donnees.salt), iterations: donnees.iterations, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    }).then(function (cle) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64(donnees.iv) }, cle, deb64(donnees.ct));
    }).then(function (clair) {
      var liste = JSON.parse(new TextDecoder().decode(clair)).map(function (a) {
        return { nom: a[0], adresse: a[1], debut: a[2], fin: a[3], lat: a[4], lon: a[5] };
      });
      try { sessionStorage.setItem("bisous-code", code); } catch (e) {}
      porte.classList.add("ouverte");
      setTimeout(function () { porte.hidden = true; }, 400);
      afficher(liste);
    }, function () {
      try { sessionStorage.removeItem("bisous-code"); } catch (e) {}
      erreur.textContent = "Ce n'est pas le bon code.";
      champ.select();
    }).then(function () { bouton.disabled = false; bouton.textContent = "Entrer"; });
  }
  function essaiMemo() {
    var memo = null; try { memo = sessionStorage.getItem("bisous-code"); } catch (e) {}
    if (memo) { champ.value = memo; ouvrir(memo); }
  }
  document.getElementById("form-code").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var code = champ.value.trim();
    if (code) ouvrir(code);
  });
})();
