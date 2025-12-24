// ==UserScript==
// @name         Show Coverage Areas on mapdevelopers.com
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Transpose polar diagramm onto a real map on mapdevelopers.com
// @match        https://aviaradar.ru/top-radars/radar/*
// @run-at       document-start
// @updateURL    https://github.com/OpossumPetya/aviatools/raw/refs/heads/main/aviaradar/userscripts/links-to-mapdevs.js
// @downloadURL  https://github.com/OpossumPetya/aviatools/raw/refs/heads/main/aviaradar/userscripts/links-to-mapdevs.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const RADARS = {
        // AR ID from URL      LAT       LON
        "749503298301067264": [40.592, 22.967] // thess1
    };

    // -----------------------------------

    const LAT = 0, LON = 1;

    const processed = new WeakSet();

    // -----------------------------------

    function calculateDestination(lat1, lon1, distanceKm, bearingDeg) {
        const EARTH_RADIUS_KM = 6371.0;

        // convert degrees to radians
        const toRad = d => d * Math.PI / 180;
        const toDeg = r => r * 180 / Math.PI;

        const lat1Rad = toRad(lat1);
        const lon1Rad = toRad(lon1);
        const bearingRad = toRad(bearingDeg);

        // angular distance in radians
        const angularDistance = distanceKm / EARTH_RADIUS_KM;

        // destination latitude
        const lat2Rad = Math.asin(
            Math.sin(lat1Rad) * Math.cos(angularDistance) +
            Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearingRad)
        );

        // destination longitude delta
        const deltaLonRad = Math.atan2(
            Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1Rad),
            Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
        );

        let lon2Rad = lon1Rad + deltaLonRad;

        // normalize longitude to [-π, π] like Perl's fmod() step
        lon2Rad = ((lon2Rad + Math.PI) % (2 * Math.PI)) - Math.PI;

        // convert radians to degrees
        const lat2 = toDeg(lat2Rad);
        const lon2 = toDeg(lon2Rad);

        return [lat2, lon2];
    }

    function showMapsLinks(span) {
        if (processed.has(span)) return;
        processed.add(span);

        const currentUrl = window.location.href;
        const radarId = currentUrl.split('/').pop();
        if (!(radarId in RADARS)) return; // do nothing for unknown radars

        const apiUrl = "https://aviaradar-client-api.arbina.com/api/feeders/" + radarId + "/action-radius"

        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            onload: function(response) {
                try {
                    // get raw data from AR
                    const data = JSON.parse(response.responseText);

                    // extract and sort by start_from_degree
                    const sortedMedianDistances = data
                    .map(item => ( item.median_distance_mt / 1000 ))
                    .sort((a, b) => a.start_from_degree - b.start_from_degree);

                    const sortedMaximumDistances = data
                    .map(item => ( item.max_distance_mt / 1000 ))
                    .sort((a, b) => a.start_from_degree - b.start_from_degree);

                    // calculate locations on the map
                    // Median:
                    let direction = -15;
                    const locationsMedian = sortedMedianDistances.map(distance => {
                        direction += 15;
                        return calculateDestination(RADARS[radarId][LAT], RADARS[radarId][LON], distance, direction);
                    });
                    locationsMedian.push(locationsMedian[0]); // close polygon
                    // Maximum
                    direction = -15;
                    const locationsMaximum = sortedMaximumDistances.map(distance => {
                        direction += 15;
                        return calculateDestination(RADARS[radarId][LAT], RADARS[radarId][LON], distance, direction);
                    });
                    locationsMaximum.push(locationsMaximum[0]); // close polygon

                    // build data for mapdevelopers.com URL
                    const finalData = [
                        //                 fill color, border color, zoom
                        [ locationsMaximum, "#F5D8C1", "#DF4231", 0.4 ],
                        [ locationsMedian, "#C1D4F5", "#3170DF", 0.4 ]
                    ];

                    const mapdevsURL = 'https://www.mapdevelopers.com/area_finder.php?polygons=' + encodeURIComponent( JSON.stringify(finalData) );
                    span.insertAdjacentHTML('afterbegin', "<a href='"+mapdevsURL+"' class='usMapLink' target='_blank' rel='noopener noreferrer' style='text-decoration:none;font-size:85%'>КАРТА</a> :: ");

                } catch (err) {
                    console.error("Failed to parse JSON:", err);
                }
            },
            onerror: function(err) {
                console.error("Request failed:", err);
            }
        });
    }

    function findPolarChartSpan() {
        return Array.from(document.querySelectorAll('[class*="styles_radar_info_chart_block_header"]'))
        .find(el => el.textContent.includes('Полярная диаграмма'))
        ?.querySelector(':scope > span');
    }

    // try immediately, in case it's already on the page
    const initialSpan = findPolarChartSpan();
    if (initialSpan) showMapsLinks(initialSpan);

    // observe all DOM changes (safe for SPA)
    const observer = new MutationObserver(() => {
        const span = findPolarChartSpan();
        if (span) showMapsLinks(span);
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
