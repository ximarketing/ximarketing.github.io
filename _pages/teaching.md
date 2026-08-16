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
      {% if course.image %}
        <div class="inner-course-card__visual" aria-hidden="true">
          <img src="{{ course.image | relative_url }}" alt="" width="1200" height="900" loading="lazy" decoding="async">
        </div>
      {% endif %}
      <div class="inner-course-card__body">
        <span>{{ course.level }}</span>
        <h2>{{ course.title }}</h2>
        {% if course.description %}<p>{{ course.description }}</p>{% endif %}
        <strong>{{ course.cta | default: 'Open materials' }} <span aria-hidden="true">→</span></strong>
      </div>
    </a>
  {% endfor %}
</div>
