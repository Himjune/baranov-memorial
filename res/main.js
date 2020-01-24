'use strict'
import 'core-js/stable'
import 'regenerator-runtime/runtime'
import { fetch } from 'whatwg-fetch'

if (!('remove' in Element.prototype)) {
  Element.prototype.remove = function () {
    if (this.parentNode) {
      this.parentNode.removeChild(this)
    }
  }
}

const default_settings = {
  per_page: 24,
  image_quality: 80,
  draw_mode: 'standard'
}
let settings = {
  per_page: Number(localStorage.getItem('per_page') || default_settings.per_page),
  image_quality: Number(localStorage.getItem('image_quality') || default_settings.image_quality),
  draw_mode: localStorage.getItem('draw_mode') in ['standard', 'generator'] ? localStorage.getItem('draw_mode') : default_settings.draw_mode
}

document.addEventListener('DOMContentLoaded', () => {
  fetch('./data/manifest.json')
    .then(res => res.json())
    .then(data => {
      console.log('Manifest', data)
      init(data)
    })
})

/**
 * Init function
 * @param {...Object} data
 * @param {Array} data.files
 * @param {String} data.name
 * @param {String} data.icon
 */
function init (data) {
  const fancy_names = {}
  const data_icons = {}
  const data_files = []

  Object.keys(data).forEach(entry => {
    fancy_names[entry] = data[entry].name
    data_icons[entry] = data[entry].icon
    data_files.push(...data[entry].files)
  })

  const WHERE_FILTER_PARAM_NAME = 'w'
  const YEAR_FILTER_PARAM_NAME = 'y'
  const TAG_FILTER_PARAM_NAME = 't'

  const modifier_tags = ['текст', 'видео']

  let full_recordset = []
  const years = {}
  const sources = {}
  const tags = {}

  let current_recordset = []
  let running_interval
  const loaded_event = new CustomEvent('records.loaded', {
    bubbles: true
  })

  function compile_all () {
    const needed = data_files.length
    let finished = 0
    for (const i in data_files) {
      if (Object.prototype.hasOwnProperty.call(data_files, i)) {
        fetch('./data/' + data_files[i] + '.json')
          .then(res => res.json())
          .then(data => {
            full_recordset = full_recordset.concat(data)
            ++finished
            if (finished === needed) {
              document.dispatchEvent(loaded_event)
            }
          })
      }
    }
  }

  /**
   * Templates
   */
  const filter_item = `<li class="dropdown-item filter-link">
                          <div class="mt-1 px-1 pb-2 d-inline-block">
                              <div class="d-inline-block filter-text">{text}</div>
                          </div>
                          <div class="d-inline-block float-right">
                              <button class="btn btn-primary btn-sm filter-btn filter-btn-allow" data-is_reverse="false" {data-tags}>
                                <span class="d-block m-auto iconify filter-icon" data-icon="fa-solid:eye" data-inline="false" data-width="18" data-height="18"></span>
                              </button><div class="d-inline-block m-0 p-0 filter-btn-divider"></div><button class="btn btn-primary btn-sm filter-btn filter-btn-block" data-is_reverse="true" {data-tags} >
                                <span class="d-block m-auto iconify filter-icon" data-icon="fa-solid:eye-slash" data-inline="false" data-width="18" data-height="18"></span>
                              </button>
                          </div>
                      </li>`

  const base_card = `<div class="col-xs-12 col-md-4 col-xl-3 pb-4 memorial-card-column">
          <div class="card memorial-card {nourl}" data-year="{year}" data-what="{where}">
              {icon}
              {img}
              <div class="card-body d-flex flex-column">
                  <h5 class="card-title">{title}</h5>
                  <p class="card-text">{teaser_text}</p>
                  <ul class="card-tags list-inline">{tags}</ul>
              </div>
                  <div class="card-footer text-muted">
                      {url} <span class="float-right date-span">{date}</span>
                  </div>
          </div>
      </div>`

  const card_icon = '<img src="{icon}" class="icon" alt="Иконка издания">'
  const card_image = '<img src="{img}" class="card-img-top" alt="Превью материала" onerror="this.onerror=null;this.src=\'logo/placeholder.jpg\';">'
  const card_url = '<a href="{url}" target="_blank" class="btn btn-primary btn-sm">Перейти к материалу</a>'
  const card_tag = '<a class="badge badge-primary badge-tag" onclick="filter_by_tag(\'{tag}\',\'{type}\')">{tag_text}</a>'
  const filter_menu_tag =
    `<a class="badge badge-primary px-3 py-lg-1 py-2 m-1 badge-tag text-uppercase selected-tags"
        onclick="remove_selected_filter(\'{tag}\',\'{type}\')"
      >
        {tag_text}
        <span class="iconify ml-1 align-baseline filter-icon" data-icon="fa-solid:times" data-inline="false"></span>
      </a>`

  const filter_menu_divider = '<span class="d-inline-block mx-2 invisible"></span>'

  const card_nourl = '<a href="https://discord.gg/zDxKb44" target="_blank" class="btn btn-danger btn-sm">Нужна помощь в поиске!</a>'
  const records_container = document.getElementById('records_container')
  const imgPlaceholder = './logo/placeholder.jpg'
  const placeholder_element = document.getElementById('placeholder')
  const draw_time = 10

  /**
   * Format date
   * @param {Object} date
   * @param {Number} date.day
   * @param {Number} date.month
   * @param {Number} date.year
   * @returns {string}
   */
  function format_date (date) {
    let date_str = date.day + ''

    if (date_str === '0') { // no day
      date_str = ''
    } else if (date_str.length === 1) { // 1-digit day
      date_str = '0' + date_str + '.'
    } else {
      date_str = date_str + '.' // 2-digit day
    }

    if ((date.month + '').length === 1) {
      date_str = date_str + '0' + date.month + '.'
    } else {
      date_str = date_str + date.month + '.'
    }

    date_str = date_str + date.year
    return date_str
  }

  /**
   * Draw a card
   * @param {Object} record
   * @param {String} record.title
   * @param {String} record.teaser_text
   * @param {Object} record.date
   * @param {Number} record.date.day
   * @param {Number} record.date.month
   * @param {Number} record.date.year
   * @param {String} record.img
   * @param {String} record.where
   * @param {Array[String]} record.tags
   * @param {String} record.url
   */
  function draw_card (record) {
    let card = base_card
      .replace('{title}', record.title)
      .replace('{teaser_text}', record.teaser_text)
      .replace('{date}', format_date(record.date))
      .replace('{year}', record.date.year.toString())
      .replace('{where}', record.where)

    if ('url' in record && record.url !== '') {
      card = card.replace('{url}', card_url.replace('{url}', record.url)).replace('{nourl}', '')
    } else {
      card = card.replace('{url}', card_nourl).replace('{nourl}', 'border-danger')
    }

    if ('where' in record && record.where !== '') {
      card = card.replace('{icon}', card_icon.replace('{icon}', './res/image/' + data_icons[record.where]))
    }

    if ('img' in record && record.img !== '') {
      card = card.replace('{img}', card_image.replace('{img}', `https://images.weserv.nl/?url=${record.img}&q=${settings.image_quality}&w=480&il&output=jpg`))
    } else {
      card = card.replace('{img}', card_image.replace('{img}', imgPlaceholder))
    }

    let tagsList = ''
    record.tags.forEach(tag => {
      tagsList += card_tag.replace(/{tag}/, tag).replace(/{type}/, 't').replace(/{tag_text}/, tag)
    })

    // add pseudo tags from source and year
    tagsList += card_tag.replace(/{tag}/, record.where).replace(/{type}/, 'w').replace(/{tag_text}/, fancy_names[record.where])
    tagsList += card_tag.replace(/{tag}/, String(record.date.year)).replace(/{type}/, 'y').replace(/{tag_text}/, String(record.date.year))

    card = card.replace('{tags}', tagsList)

    records_container.insertAdjacentHTML('beforeend', card)
  }

  /**
   * Iterate generator
   * @param {Object} _records
   * @returns {Generator<*, void, ?>}
   */
  function * iterate (_records) {
    for (const i in _records) {
      if (Object.prototype.hasOwnProperty.call(_records, i)) {
        yield _records[i]
      }
    }
  }

  /**
   * draw - центральная функция, вызывая её с записями в аргументе
   * мы присваиваем глобальному current_recordset значение этих записей.
   * если draw вызывается без аргумента то мы просто рендерит current_recordset
   * с учётом текущего current_page.
   * Это всё нужно для того, чтоб при применении фильтров нам не приходилось
   * шерстить полный рекордсет и фильтровать при каждом переходе по страницам
   * в пагинации.
   *
   * @param {Object} [_records]
   */
  function draw (_records) {
    if (_records === undefined) {
      _records = current_recordset
    } else {
      current_recordset = _records
    }

    _records = paginate(_records)

    if (settings.draw_mode === 'generator') {
      draw_generator(_records)
    } else {
      draw_foreach(_records)
    }

    setTimeout(() => {
      document.getElementById('records_container').style.height = ''
      placeholder_element.classList.remove('d-block')
      placeholder_element.classList.add('d-none')
    }, draw_time)
  }

  /**
   * pagination stuff
   */
  const pagination_item_base = '<li class="page-item {state}"><button class="page-link paginator-button" data-page="{num}">{num}</button></li>'
  const pagination_container_top = document.getElementById('pagination_container_top')
  const pagination_container_bottom = document.getElementById('pagination_container_bottom')

  let current_page = 1
  const visible_pages = 6 // Choose only even numbers for greater UI
  const pages_before_after = Math.floor(visible_pages / 2) - 1

  /**
   * Paginator
   * @param {Object} _records
   * @param {Number} per_page
   * @returns {*}
   */
  function paginate (_records, per_page = Number(settings.per_page)) {
    const page = current_page
    const total_pages = Math.ceil(_records.length / per_page)

    if (per_page >= _records.length) {
      per_page = _records.length
    }

    console.group('Pagination details')
    console.log('Per page:', per_page)
    console.log('Total pages:', total_pages)
    console.log('Current page:', current_page)
    console.log('Visible pages:', visible_pages)
    console.log('Pages before and after:', pages_before_after)
    console.groupEnd()

    pagination_container_top.innerHTML = ''
    pagination_container_bottom.innerHTML = ''
    let num_start = 1
    let num_end = total_pages

    if (total_pages >= visible_pages) {
      num_end = visible_pages

      if (page > pages_before_after + 1) {
        num_start = page - pages_before_after
        num_end = page + pages_before_after
      }

      if (page >= total_pages - pages_before_after) {
        num_start = total_pages - visible_pages + 1
        num_end = total_pages
      }
    }

    console.groupCollapsed('Pagination drawing')
    let pagination_dom = ''

    // Start button
    if (total_pages > 2) {
      pagination_dom += pagination_item_base
        .replace(/{num}/, '1') // data-num
        .replace(/{num}/, '&laquo; <em>1</em>') // button text
        .replace(/{state}/, page === 1 ? 'active' : '')
      console.log('« 1')
    }

    // Pages
    for (let i = num_start; i <= num_end; ++i) {
      if (total_pages > 2) {
        if (page <= visible_pages && i === 1) continue
        if (page >= total_pages - visible_pages + 1 && i === total_pages) continue
      }

      pagination_dom += pagination_item_base
        .replace(/{num}/g, String(i))
        .replace(/{state}/, i === page ? 'active' : '')
      console.log('Page', i)
    }

    // End button
    if (total_pages > 2) {
      pagination_dom += pagination_item_base
        .replace(/{num}/, total_pages.toString()) // data-num
        .replace(/{num}/, `<em>${total_pages}</em> &raquo;`) // button text
        .replace(/{state}/, page === total_pages ? 'active' : '')
    }

    console.log(total_pages + ' »')
    console.groupEnd()

    pagination_container_top.insertAdjacentHTML('beforeend', pagination_dom)
    pagination_container_bottom.insertAdjacentHTML('beforeend', pagination_dom)

    Array.from(document.getElementsByClassName('paginator-button')).forEach(item => {
      if (Number(item.dataset.page) !== current_page) {
        item.addEventListener('click', () => {
          remove_cards()
          current_page = Number(item.dataset.page)
          console.log('Drawing page', current_page)
          draw()

          route_scroll_to_rc()
        })
      }
    })

    const offset = (page - 1) * per_page
    return _records.slice(offset, offset + per_page)
  }

  /**
   * @param {Object} _records
   */
  function draw_foreach (_records) {
    console.log('drawing with foreach')
    _records.forEach(record => {
      draw_card(record)
    })
  }

  /**
   * @param {Object} _records
   */
  function draw_generator (_records) {
    console.log('drawing with generator')
    const iterator = iterate(_records)
    if (running_interval) {
      clearInterval(running_interval)
    }

    running_interval = setInterval(function () {
      const iteritem = iterator.next()
      if (iteritem.done) {
        clearInterval(running_interval)
      } else {
        draw_card(iteritem.value)
      }
    }, draw_time)
  }

  /**
   * Build filter item in navbar
   * @param {String} text
   * @param {...Object} filterParams
   * @returns {string}
   */
  function build_filter_item ({ text, ...filterParams }) {
    let dataset = ''
    Object.entries(filterParams).forEach(([key, val]) => {
      dataset += `data-${key}="${val}"`
    })

    return filter_item.replace(/{data-tags}/g, dataset).replace(/{text}/, text)
  }

  function util_update_query_param (param_name, param_val) {
    console.log(param_name, param_val, param_val.length)

    let is_changed = false
    const hash_string = decodeURIComponent(parent.location.hash)

    // no params in query
    if (hash_string.length === 0) {
      parent.location.hash = param_name + '=' + param_val
      if (param_val !== '') is_changed = true
    } else {
      let param_start = hash_string.indexOf('#' + param_name + '=')
      const param_start_not_first = hash_string.indexOf('&' + param_name + '=')

      const before_len = hash_string.length

      // if param is not first
      if (param_start_not_first > param_start) {
        param_start = param_start_not_first
      }
      // there some params in query, but no 'param_name'
      if (param_start < 0) {
        parent.location.hash += '&' + param_name + '=' + param_val
      } else {
        let param_end = hash_string.indexOf('&', param_start + 1)

        // our param to change is the last, so taking line-length as end
        if (param_end < 0) {
          param_end = hash_string.length
        }

        parent.location.hash = hash_string.substring(0, param_start + 1) + param_name + '=' + param_val + hash_string.substr(param_end)
      }

      if (before_len !== parent.location.hash.length) is_changed = true
    }

    return is_changed
  }

  function util_get_query_param (param_name) {
    let param_val = '' // '' will be returned if there is no such param

    const hash_string = decodeURIComponent(parent.location.hash)
    if (hash_string.length > 0) {
      // starting from char 1 to skip first '#'
      const param_strings = hash_string.substring(1).split('&')
      param_strings.forEach(function (str) {
        const cur_param_splited = str.split('=')
        if (cur_param_splited[0] === param_name) {
          param_val = cur_param_splited[1]
        }
      })
    }

    return param_val
  }

  function remove_filter_from_query (filter_type, tag) {
    let is_changed = false

    const query_param = util_get_query_param(filter_type)

    if (query_param.length > 0) {
      let new_query_string = ''
      query_param.split(',').forEach(query_tag => {
        if (query_tag === tag) {
          is_changed = true
        } else {
          new_query_string += (query_tag + ',')
        }
      })

      if (is_changed) {
        if (new_query_string.length > 0) {
          // dont forget to remove unnesessary comma
          util_update_query_param(filter_type, new_query_string.substr(0, new_query_string.length - 1))
        } else {
          util_update_query_param(filter_type, '') // removed all filters
        }
      }
    }

    return is_changed
  }

  function parse_filters_from_query (filter_type) {
    const filter_string = util_get_query_param(filter_type)

    let vals_array = []

    if (filter_string.length > 0) {
      vals_array = filter_string.split(',')
    }

    return vals_array
  }

  function add_filter_to_query (filter_type, tag, is_reverse, add_first = false) {
    let is_changed = false

    is_reverse = (is_reverse === 'true')
    let final_tag
    if (!is_reverse) {
      final_tag = tag
    } else {
      final_tag = '!' + tag
    }

    let cur_filter_param = util_get_query_param(filter_type)

    if (cur_filter_param === '') {
      util_update_query_param(filter_type, final_tag)
      is_changed = true
    } else {
      const cur_filter_tags = cur_filter_param.split(',')

      let tag_reversed_ver // gonna check reversed version of tag being added to just replace it if needed
      if (!is_reverse) {
        tag_reversed_ver = '!' + tag
      } else {
        tag_reversed_ver = tag
      }

      if (cur_filter_tags.indexOf(tag_reversed_ver) < 0) {
        if (cur_filter_tags.indexOf(final_tag) < 0) {
          if (add_first) {
            util_update_query_param(filter_type, final_tag + ',' + cur_filter_param) // just add the tag before all (ex.: for modifiers)
          } else {
            util_update_query_param(filter_type, cur_filter_param + ',' + final_tag) // just add the tag
          }
          is_changed = true
        }
      } else {
        cur_filter_param = cur_filter_param.replace(tag_reversed_ver, final_tag) // replace reversed tag on new one
        util_update_query_param(filter_type, cur_filter_param)
        is_changed = true
      }
    }

    return is_changed
  }

  function render_selected_part (tag_type) {
    const tags_array = parse_filters_from_query(tag_type)

    if (tags_array.length === 0) return ''

    let tags_badges = ''

    if (tag_type === YEAR_FILTER_PARAM_NAME) {
      tags_array.sort((a, b) => {
        if (a[0]==="!") a = a.substring(1)
        if (b[0]==="!") b = b.substring(1)
        return parseInt(a, 10) - parseInt(b, 10)
      })
    }

    tags_array.forEach(tag => {
      const is_reverse = (tag.indexOf('!') === 0)
      let tag_text = tag

      if (is_reverse) {
        tag_text = tag.substring(1)
      }

      if (fancy_names[tag_text] !== undefined) {
        tag_text = fancy_names[tag_text]
      }

      if (is_reverse) {
        tag_text = 'НЕ ' + tag_text
      }

      tags_badges += filter_menu_tag.replace(/{tag}/, tag).replace(/{type}/, tag_type).replace(/{tag_text}/, tag_text)
    })

    return tags_badges
  }

  const FILTER_BTN_ACTIVE_CLASS_NAME = "filter-btn-activated"
  function add_active_class_filter_btn (element) {
    var classes = element.className.split(" ")
    var i = classes.indexOf(FILTER_BTN_ACTIVE_CLASS_NAME)

    if (i < 0) {
      classes.push(FILTER_BTN_ACTIVE_CLASS_NAME)
      element.className = classes.join(" ")
      console.log('added')
    }
  }
  function remove_active_class_filter_btn (element) {
    var classes = element.className.split(" ")
    var i = classes.indexOf(FILTER_BTN_ACTIVE_CLASS_NAME)

    if (i >= 0) {
      classes.splice(i, 1)
      element.className = classes.join(" ")
      console.log('added')
    }
  }

  function render_btns_by_selected_filters () {
    const where_filters = parse_filters_from_query(WHERE_FILTER_PARAM_NAME)
    const year_filters = parse_filters_from_query(YEAR_FILTER_PARAM_NAME)
    const tag_filters = parse_filters_from_query(TAG_FILTER_PARAM_NAME)
    let btns = 0

    console.log(btns)

    Array.from(document.getElementsByClassName('filter-btn')).forEach(item => {
      let btn_tag = ''
      let is_active = false

      if ('where' in item.dataset) {
        btn_tag = item.dataset.where
        if (item.dataset.is_reverse === 'true') btn_tag = '!' + btn_tag
        is_active = where_filters.includes(btn_tag)
      } else if ('year' in item.dataset) {
        btn_tag = item.dataset.year
        if (item.dataset.is_reverse === 'true') btn_tag = '!' + btn_tag
        is_active = year_filters.includes(btn_tag)
      } else if ('tag' in item.dataset) {
        btn_tag = item.dataset.tag
        if (item.dataset.is_reverse === 'true') btn_tag = '!' + btn_tag
        is_active = tag_filters.includes(btn_tag)
      }

      if (is_active) {
        add_active_class_filter_btn(item)
      } else {
        remove_active_class_filter_btn(item)
      }

      btns++
    })

    console.log(btns)
  }

  function render_selected_filters () {
    let insertion_html = ''
    let badges_part
    let has_prev_part = false

    badges_part = render_selected_part(WHERE_FILTER_PARAM_NAME)
    if (badges_part.length > 0) {
      insertion_html = badges_part

      has_prev_part = true
    }

    badges_part = render_selected_part(YEAR_FILTER_PARAM_NAME)
    if (badges_part.length > 0) {
      if (has_prev_part) {
        insertion_html += filter_menu_divider
      }

      insertion_html += badges_part

      has_prev_part = true
    }

    badges_part = render_selected_part(TAG_FILTER_PARAM_NAME)
    if (badges_part.length > 0) {
      if (has_prev_part) {
        insertion_html += filter_menu_divider
      }

      insertion_html += badges_part

      has_prev_part = true
    }

    // possible performance issue here
    const elem = document.getElementById('selected-filters-block')
    elem.innerHTML = ''

    if (insertion_html.length > 0) {
      document.getElementById('navbar-main-link').href = '/' + parent.location.hash

      insertion_html += '<a class="badge badge-danger px-3 py-lg-1 py-2 my-1 mx-3 badge-tag text-uppercase selected-tags" onclick="remove_all_filters()">Сбросить все <span class="iconify ml-1 align-baseline filter-icon" data-icon="fa-solid:times" data-inline="false"></span></a>'
      elem.insertAdjacentHTML('afterbegin', insertion_html)
    } else {
      document.getElementById('navbar-main-link').href = '/'
    }

    render_btns_by_selected_filters()
  }

  function render_years_filter_menus (labels) {
    let element = document.getElementById('filters_year')
    element.innerHTML = `
      <div class="dropdown-divider"></div>
      <button class="dropdown-item" data-label-key="years" id="unfilter_year" onclick="remove_typed_filters('y')">Сбросить фильтр по годам</button>
    `

    const filter_years = Object.keys(labels).reverse().map(year =>
      build_filter_item({
        year,
        text: `${year} (${labels[year]})`
      })
    )

    element.insertAdjacentHTML('afterbegin', filter_years.join(''))
    document.getElementById('filter-label-years').innerText = `Годы (${filter_years.length})`
  }

  function render_sources_filter_menus (labels) {
    let element = document.getElementById('filters_where')
    element.innerHTML = `
      <div class="dropdown-divider"></div>
      <button class="dropdown-item" data-label-key="sources" id="unfilter_where" onclick="remove_typed_filters('w')">Сбросить фильтр по изданиям</button>
    `

    const sorted_sources = Object.keys(labels).sort(function (a, b) {
      if (labels[a] > labels[b]) {
        return -1
      }
      if (labels[a] < labels[b]) {
        return 1
      }

      return 0
    })

    const filter_sources = sorted_sources.map(source =>
      build_filter_item({
        where: source,
        text: `${fancy_names[source]} (${labels[source]})`
      })
    )

    element.insertAdjacentHTML('afterbegin', filter_sources.join(''))
    document.getElementById('filter-label-sources').innerText = `Издания (${filter_sources.length})`
  }

  function render_tags_filter_menus (labels) {
    let element = document.getElementById('filters_tag')
    element.innerHTML = `
      <div class="dropdown-divider"></div>
      <button class="dropdown-item" data-label-key="tags" id="unfilter_tag" onclick="remove_typed_filters('t')">Сбросить фильтр по тегам</button>
    `

    const sorted_tags = Object.keys(labels).sort(function (a, b) {
      if (labels[a] > labels[b]) {
        return -1
      }
      if (labels[a] < labels[b]) {
        return 1
      }
      return 0
    })

    let modifier_search_idx = 0
    let found_modifiers = 0
    let mod_sorted_tags = []

    while (modifier_search_idx >= 0) {
      modifier_search_idx = sorted_tags.findIndex((tag) => {
        return modifier_tags.includes(tag)
      })

      if (modifier_search_idx >= 0) {
        found_modifiers++

        mod_sorted_tags.push(sorted_tags[modifier_search_idx])
        sorted_tags.splice(modifier_search_idx, 1)
      }
    }

    mod_sorted_tags = mod_sorted_tags.concat(sorted_tags)

    const filter_tags = mod_sorted_tags.map(tag =>
      build_filter_item({
        tag,
        text: `${tag} (${labels[tag]})`
      })
    )

    filter_tags.splice(found_modifiers, 0, '<div class="dropdown-divider"></div>') // there are two main tag categories to be separated
    element.insertAdjacentHTML('afterbegin', filter_tags.join(''))
    document.getElementById('filter-label-tags').innerText = `Тэги (${filter_tags.length - 1})`
  }

  document.addEventListener('records.loaded', function () {
    /**
     * Необходимо отсортировать полный recordset
     * для дальнейшего использования
     */
    full_recordset = full_recordset.sort(function (a, b) {
      let amonth
      let bmonth
      let aday
      let bday
      a = a.date
      b = b.date
      if ((a.month + '').length === 1) {
        amonth = '0' + a.month
      } else {
        amonth = a.month
      }
      if ((b.month + '').length === 1) {
        bmonth = '0' + b.month
      } else {
        bmonth = b.month
      }
      if ((a.day + '').length === 1) {
        aday = '0' + a.day
      } else {
        aday = a.day
      }
      if ((b.day + '').length === 1) {
        bday = '0' + b.day
      } else {
        bday = b.day
      }
      if (Number(a.year + '' + amonth + '' + aday) > Number(b.year + '' + bmonth + '' + bday)) {
        return -1
      }
      if (Number(a.year + '' + amonth + '' + aday) < Number(b.year + '' + bmonth + '' + bday)) {
        return 1
      }
      return 0
    })

    document.getElementById('filter_name').innerText = `Все записи (${full_recordset.length})`
    document.getElementById('records_count').innerText = `На текущий момент их ${full_recordset.length}.`

    const after_load_tags = util_get_query_param(WHERE_FILTER_PARAM_NAME) +
      util_get_query_param(YEAR_FILTER_PARAM_NAME) +
      util_get_query_param(TAG_FILTER_PARAM_NAME)

    if (util_get_query_param("nourls").length !== 0) {
      draw_nourl()
      util_update_query_param("nourls","")
    } else if (after_load_tags.length === 0) {
      draw(full_recordset)
    } else {
      render_selected_filters()
      draw_with_filter()
    }

    for (const i in full_recordset) {
      if (Object.prototype.hasOwnProperty.call(full_recordset, i)) {
        const record = full_recordset[i]

        if (!years[record.date.year]) {
          years[record.date.year] = 0
        }
        ++years[record.date.year]

        if (!sources[record.where]) {
          sources[record.where] = 0
        }
        ++sources[record.where]

        record.tags && record.tags.forEach(function (tag) {
          if (!tags[tag]) {
            tags[tag] = 0
          }
          ++tags[tag]
        })
      }
    }

    render_years_filter_menus(years)
    render_sources_filter_menus(sources)
    render_tags_filter_menus(tags)

    const filter_labels = Array.from(document.getElementsByClassName('filter-label'))
    filter_labels.forEach(filter_label => {
      filter_label.dataset.originalKey = filter_label.innerText.trim()
    })

    render_btns_by_selected_filters() // rerender selected btns after menuitems loaded

    function draw_with_filter () {
      current_page = 1
      remove_cards()

      const where_filters = parse_filters_from_query(WHERE_FILTER_PARAM_NAME)
      const year_filters = parse_filters_from_query(YEAR_FILTER_PARAM_NAME)
      const tag_filters = parse_filters_from_query(TAG_FILTER_PARAM_NAME)

      const filter_result = filter(where_filters, year_filters, tag_filters)

      if (filter_result.records.length === full_recordset.length) {
        document.getElementById('filter_name').innerText = `Все записи (${full_recordset.length})`
      } else {
        document.getElementById('filter_name').innerText = `Выбранные материалы (${filter_result.records.length})`
      }

      draw(filter_result.records)
    }

    function draw_nourl () {
      current_page = 1
      remove_cards()
      const nourl_recordset = full_recordset.filter(function (record) {
        return !record.url
      })
      document.getElementById('filter_name').innerText = `Материалы без ссылок (${nourl_recordset.length})`
      draw(nourl_recordset)

      route_scroll_to_rc()
    }

    // глобальная функция для кнопок тегов в карточках
    window.filter_by_tag = function (tag, tag_type) {
      if (add_filter_to_query(tag_type, tag, false, modifier_tags.includes(tag))) {
        render_selected_filters()
        draw_with_filter()
        route_scroll_to_rc()
      }
    }

    // глобальная функция для кнопок удаления фильтра
    window.remove_selected_filter = function (tag, tag_type) {
      if (remove_filter_from_query(tag_type, tag)) {
        render_selected_filters()
        draw_with_filter()
        route_scroll_to_rc()
      }
    }

    // глобальная функция для кнопок удаления фильтров типа
    window.remove_typed_filters = function (tag_type) {
      if (util_update_query_param(tag_type, '')) {
        render_selected_filters()
        draw_with_filter()
        route_scroll_to_rc()
      }
    }

    // глобальная функция для кнопок удаления фильтров всех типов
    window.remove_all_filters = function () {
      let is_changed = false
      is_changed = util_update_query_param(WHERE_FILTER_PARAM_NAME, '') || is_changed
      is_changed = util_update_query_param(YEAR_FILTER_PARAM_NAME, '') || is_changed
      is_changed = util_update_query_param(TAG_FILTER_PARAM_NAME, '') || is_changed

      if (is_changed) {
        current_page = 1
        remove_cards()

        render_selected_filters()
        document.getElementById('filter_name').innerText = `Все записи (${full_recordset.length})`

        draw(full_recordset)
        route_scroll_to_rc()
      }
    }

    Array.from(document.getElementsByClassName('filter-link')).forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation()
      })
    })

    Array.from(document.getElementsByClassName('filter-btn')).forEach(item => {
      item.addEventListener('click', () => {
        let need_filtering = false

        if ('where' in item.dataset) {
          if (add_filter_to_query(WHERE_FILTER_PARAM_NAME, item.dataset.where, item.dataset.is_reverse)) {
            render_selected_filters()

            need_filtering = true
          }
        }

        if ('year' in item.dataset) {
          if (add_filter_to_query(YEAR_FILTER_PARAM_NAME, item.dataset.year, item.dataset.is_reverse)) {
            render_selected_filters()

            need_filtering = true
          }
        }

        if ('tag' in item.dataset) {
          if (add_filter_to_query(TAG_FILTER_PARAM_NAME, item.dataset.tag, item.dataset.is_reverse, modifier_tags.includes(item.dataset.tag))) {
            render_selected_filters()

            need_filtering = true
          }
        }

        if (need_filtering) {
          draw_with_filter()
          route_scroll_to_rc()
        }
      })
    })
  })

  compile_all()

  function remove_cards () {
    document.getElementById('records_container').style.height = '1080px'
    Array.from(document.getElementsByClassName('memorial-card-column')).forEach(card => card.remove())
  }

  function filter_by_where (record, filters) {
    if (filters.length === 0) return true

    let is_acceptable = false
    let is_blocked = false
    let has_only_reversed = true

    filters.forEach(filter => {
      let raw_filter = filter
      const is_reverse = (filter.indexOf('!') === 0)

      if (is_reverse) {
        raw_filter = filter.substring(1)
      } else {
        has_only_reversed = false
      }

      if (!is_reverse && record.where === raw_filter) {
        is_acceptable = true
      } else if (is_reverse && record.where === raw_filter) {
        is_blocked = true
      }
    })

    return (is_acceptable || has_only_reversed) && !is_blocked
  }

  function filter_by_year (record, filters) {
    if (filters.length === 0) return true

    let is_acceptable = false
    let is_blocked = false
    let has_only_reversed = true

    filters.forEach(filter => {
      let raw_filter = filter
      const is_reverse = (filter.indexOf('!') === 0)

      if (is_reverse) {
        raw_filter = filter.substring(1)
      } else {
        has_only_reversed = false
      }

      raw_filter = parseInt(raw_filter, 10)

      if (!is_reverse && record.date.year === raw_filter) {
        is_acceptable = true
      } else if (is_reverse && record.date.year === raw_filter) {
        is_blocked = true
      }
    })

    return (is_acceptable || has_only_reversed) && !is_blocked
  }

  function filter_by_tag (record, filters) {
    if (filters.length === 0) return true

    let modifiers_group = false
    let has_accepting_modifiers = false

    let tags_group = false
    let has_accepting_tags = false

    let is_blocked = false

    filters.forEach(filter => {
      let raw_filter = filter

      const is_reverse = (filter.indexOf('!') === 0)
      if (is_reverse) {
        raw_filter = filter.substring(1)
      }

      const is_modifier = modifier_tags.includes(raw_filter)

      if (!is_reverse) {
        if (is_modifier) {
          has_accepting_modifiers = true
          modifiers_group |= record.tags.includes(raw_filter)
        } else {
          has_accepting_tags = true
          tags_group |= record.tags.includes(raw_filter)
        }
      }

      if (is_reverse && record.tags !== undefined && record.tags.includes(raw_filter)) {
        is_blocked = true
      }
    })

    return (!has_accepting_modifiers || modifiers_group) && (!has_accepting_tags || tags_group) && !is_blocked
  }

  /**
   * filter - центральная функция фильтрации
   * Фильтрация происходит по трем категориям: Издания, Года, Теги
   * Им соответствуют значения в хэше url под обозначениями 'w', 'y', 't'
   * Эти константы заданы выше (WHERE_FILTER_PARAM_NAME, например)
   * Между категориями фильтрация по правилу И
   * Т.е. выбранные фильтры Издание: игромания и Годы: 2019
   * оставит только карточки И с игромании, И 2019г
   * Внутри категории фильтрация по правилу ИЛИ
   * Т.е. выбранные фильтры Годы: 2018, 2019
   * оставят карточки месет и за 18ый и за 19ый год
   * Исключение - Модификаторы - особые фильтры в разделе Теги
   * Указаны вверху в константе modifier_tags ("текст", "видео")
   * Один из этих тегов должен быть по задумке у каждой карточки
   * Они относятся к остальным тегам (если такие есть) по правилу И
   * Т.е. если указан только тег(и)-модификатор(ы) (текст, например),
   * то будут возвращены все записи с этим тегом
   * Если в фильтрах есть и обычные теги, и модификатор (Например: текст, обзор, статья)
   * то из выборки обычных тегов (т.е. объединеное множество обзоров и статей) остануться
   * только те, у которых еще и есть тег-мадификатор (текст, в данном случае)
   *
   * Также тег может быть выбран в блокирующем (инверсном) режиме (в url помечается воскл.знаком)
   * материалы с этим тегом будут удалены из выборки независимо от всех остальных тегов
   *
   * Возвращает объект, состоящий из
   *  records - отфильтрованные записи;
   *  filtered_years - счетчик встреченных записей по годам;
   *  filtered_sources - счетчик встреченных записей по изданиям;
   *  filtered_tags - счетчик встреченных записей по тегам;
   *  ! В СЧЕТЧИКАХ ЗНАЧЕНИЯ МОГУТ БЫТЬ ОТРИЦАТЕЛЬНЫМИ !
   *
   * @param {Array} where_filters
   * @param {Array} year_filters
   * @param {Array} tag_filters
   * @returns {Object}
   */
  function filter (where_filters, year_filters, tag_filters) {
    if (where_filters.length + year_filters.length + tag_filters.length === 0) {
      return {records: full_recordset, filtered_years: years, filtered_sources: sources, filtered_tags: tags}
    }

    const filtered_years = years
    const filtered_sources = sources
    const filtered_tags = tags

    let result = {}
    result.records = full_recordset.filter(record => {
      const is_passed_filter = filter_by_where(record, where_filters) &&
        filter_by_year(record, year_filters) &&
        filter_by_tag(record, tag_filters)


      // we need to mark tags that have not apeared in filtered set (no place 0)
      // without additional cycling whole list. That's why when we have positive number
      // here - it means we met it first time and we should 0 it. And count to negative side
      // so we know where we count filtered values and where we have default ones

      // determine one time if we need to add to counter current record
      let modifier = 0
      if (is_passed_filter) {
        modifier = 1
      }

      if (filtered_years[record.date.year]>0) {
        filtered_years[record.date.year] = 0
      }
      filtered_years[record.date.year] -= modifier

      if (filtered_sources[record.where]>0) {
        filtered_sources[record.where] = 0
      }
      filtered_sources[record.where] -= modifier

      record.tags && record.tags.forEach(function (tag) {
        if (filtered_tags[tag]>0) {
          filtered_tags[tag] = 0
        }
        filtered_tags[tag] -= modifier
      })

      return is_passed_filter
    })

    result.filtered_years = filtered_years
    result.filtered_sources = filtered_sources
    result.filtered_tags = filtered_tags

    return result
  }

  function route_scroll_to_rc () {
    setTimeout(() => {
      document.getElementById('start').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      })
    }, draw_time)
  }

  document.getElementById('default_settings').onclick = () => {
    if (confirm('Данное действие сбросит все настройки. Продолжить?')) {
      updateSettings(default_settings)
    }
  }

  document.getElementById('settings_form').oninput = () => {
    const new_settings = {
      per_page: document.getElementById('per_page_setting').value,
      image_quality: document.getElementById('image_quality_setting').value,
      draw_mode: document.querySelector('[name=draw_mode_setting]:checked').value
    }

    console.log(new_settings)
    updateSettings(new_settings)
  }

  /**
   * Update settings
   * @param {Object} new_settings
   */
  function updateSettings (new_settings) {
    settings = new_settings
    Object.keys(new_settings).forEach(setting => {
      localStorage.setItem(setting, new_settings[setting])

      if (setting === 'draw_mode') {
        document.getElementById(`draw_mode_${new_settings[setting]}`).checked = 'on'
      } else {
        document.getElementById(setting + '_setting').value = new_settings[setting]
      }
    })
  }

  updateSettings(settings)
}
