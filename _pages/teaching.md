---
layout: single
permalink: /_pages/teaching/
title: "Teaching"
excerpt: "Courses and data cases taught by Professor Xi Li at HKU Business School."
author_profile: false
body_class: "teaching-page"
---

<p class="inner-lead">I enjoy teaching. My teaching spans undergraduate, MSc, MBA, EMBA, Executive Education, and PhD programmes. My teaching connects marketing questions with AI, algorithms, data analytics, and economics. Course links and existing student resources remain available below.</p>

{% assign courses = site.data.home.teaching | where: "kind", "course" %}
{% assign cases = site.data.home.teaching | where: "kind", "case" %}

<section class="teaching-catalog" aria-labelledby="teaching-courses-title">
  <h2 class="teaching-catalog__title" id="teaching-courses-title">Courses</h2>
  <div class="inner-card-grid course-list">
    {% for course in courses %}
      {% include teaching-card.html course=course %}
    {% endfor %}
  </div>
</section>

<section class="teaching-catalog" aria-labelledby="teaching-cases-title">
  <h2 class="teaching-catalog__title" id="teaching-cases-title">Cases</h2>
  <div class="inner-card-grid course-list">
    {% for course in cases %}
      {% include teaching-card.html course=course %}
    {% endfor %}
  </div>
</section>
