---
layout: single
permalink: /_pages/teaching/
title: "Teaching"
excerpt: "Courses and data cases taught by Professor Xi Li at HKU Business School."
author_profile: false
body_class: "teaching-page"
---

<p class="inner-lead">My teaching spans undergraduate, MSc, MBA, EMBA, Executive Education, and PhD programmes. My teaching connects marketing questions with AI, algorithms, data analytics, and economics. Course links and existing student resources remain available below.</p>

<div class="inner-card-grid course-list">
  {% for course in site.data.home.teaching %}
    {% if course.url %}
      <a class="inner-course-card{% if course.featured %} inner-course-card--featured{% endif %}" href="{{ course.url }}">
    {% else %}
      <article class="inner-course-card{% if course.featured %} inner-course-card--featured{% endif %}">
    {% endif %}
      {% if course.image %}
        <div class="inner-course-card__visual" aria-hidden="true">
          <img src="{{ course.image | relative_url }}" alt="" width="1200" height="900" loading="lazy" decoding="async">
        </div>
      {% endif %}
      <div class="inner-course-card__body">
        <span>{{ course.level }}</span>
        <h2>{{ course.title }}</h2>
        {% if course.description %}<p>{{ course.description }}</p>{% endif %}
        {% if course.url %}<strong>{{ course.cta | default: 'Open materials' }} <span aria-hidden="true">→</span></strong>{% endif %}
      </div>
    {% if course.url %}</a>{% else %}</article>{% endif %}
  {% endfor %}
</div>
