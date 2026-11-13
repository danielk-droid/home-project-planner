/*
  Private access to the owner insights dashboard.
  This file is deliberately NOT linked from any visible page element.
  Two ways in, from any page that loads it:
    1. Double-click the "Home Project Planner" text in the footer.
    2. Press Shift + Alt + I (Shift + Option + I on a Mac).
  It never runs while the user is typing in a field.
*/
(function () {
  "use strict";

  var DASHBOARD = "/insights/";

  function open() {
    window.location.href = DASHBOARD;
  }

  function footerBrand() {
    return document.getElementById("footerBrand");
  }

  function attachFooter() {
    var brand = footerBrand();
    if (!brand || brand.dataset.insightsBound === "1") return;
    brand.dataset.insightsBound = "1";
    brand.addEventListener("dblclick", function (event) {
      event.preventDefault();
      open();
    });
  }

  function isTyping(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    var tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  document.addEventListener("keydown", function (event) {
    if (isTyping(event.target)) return;
    if (!event.shiftKey || !event.altKey) return;
    if (event.key !== "I" && event.key !== "i" && event.code !== "KeyI") return;
    event.preventDefault();
    open();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachFooter);
  } else {
    attachFooter();
  }
})();
