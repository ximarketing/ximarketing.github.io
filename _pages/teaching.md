---
layout: single
permalink: /_pages/teaching/
title: "Teaching"
excerpt: "Courses and data cases taught by Professor Xi Li at HKU Business School."
author_profile: false
body_class: "teaching-page"
---

<p class="inner-lead">My teaching connects marketing questions with algorithms, economics, programming, and data analytics. Course links and existing student resources remain available below.</p>

<div class="inner-card-grid course-list">
  {% for course in site.data.home.teaching %}
    <a class="inner-course-card{% if course.featured %} inner-course-card--featured{% endif %}" href="{{ course.url }}">
      <span>{{ course.level }}</span>
      <h2>{{ course.title }}</h2>
      {% if course.description %}<p>{{ course.description }}</p>{% endif %}
      <strong>Open materials <span aria-hidden="true">→</span></strong>
    </a>
  {% endfor %}
</div>
