---
layout: single
permalink: /teaching/
redirect_from:
  - /_pages/teaching/
title: "Teaching"
excerpt: "Courses and data cases taught by Professor Xi Li at HKU Business School."
author_profile: false
body_class: "teaching-page"
language_namespace: "teaching_page"
---

<p class="inner-lead" data-i18n="teaching_page.intro">I enjoy teaching. My teaching spans undergraduate, postgraduate, MBA, EMBA, Executive Education, and PhD programmes. My teaching connects marketing questions with AI, algorithms, data analytics, and economics. Course links and existing student resources remain available below.</p>

{% assign courses = site.data.home.teaching | where: "kind", "course" %}
{% assign cases = site.data.home.teaching | where: "kind", "case" %}

<section class="teaching-catalog" aria-labelledby="teaching-courses-title">
  <h2 class="teaching-catalog__title" id="teaching-courses-title" data-i18n="teaching_page.sections.courses">Courses</h2>
  <div class="inner-card-grid course-list">
    {% for course in courses %}
      {% include teaching-card.html course=course %}
    {% endfor %}
  </div>
</section>

<section class="teaching-catalog" aria-labelledby="teaching-cases-title">
  <h2 class="teaching-catalog__title" id="teaching-cases-title" data-i18n="teaching_page.sections.cases">Cases</h2>
  <div class="inner-card-grid course-list">
    {% for course in cases %}
      {% include teaching-card.html course=course %}
    {% endfor %}
  </div>
</section>
