---
title:  "Welcome!"
mathjax: true
layout: post
categories: media
---

![Swiss Alps](https://user-images.githubusercontent.com/4943215/55412536-edbba180-5567-11e9-9c70-6d33bca3f8ed.jpg)


## Main Content

Here is a showcase of some of my work, and some reflections on those efforts.Gradually, I will consider setting this place as a place to put diary, whether in life or work.

## Code

I'll post some key code, but of course, please refer to my GitHub page for more detailed open source code. The example is shown below.

{% highlight c %}

static void asyncEnabled(Dict* args, void* vAdmin, String* txid, struct Allocator* requestAlloc)
{
    struct Admin* admin = Identity_check((struct Admin*) vAdmin);
    int64_t enabled = admin->asyncEnabled;
    Dict d = Dict_CONST(String_CONST("asyncEnabled"), Int_OBJ(enabled), NULL);
    Admin_sendMessage(&d, txid, admin);
}

{% endhighlight %}

## Gists

With the `jekyll-gist` plugin, which is preinstalled on Github Pages, I will embed the gists shown below:

<script src="https://gist.github.com/5555251.js?file=gist.md"></script>

## Daily

Some `daily` routines that are worth sharing are likewise posted, such as, travel, sports and various activities.

![daily](/assets/daily.jpg)

[daily](/assets/daily.jpg) by The New York Times

## Shared Videos

Some of the videos that I think involve interesting work and crazy ideas will also be shared here.

{% include embed.html url="https://www.bilibili.com/video/BV1Xb4y1Z7xC?spm_id_from=333.337.search-card.all.click" %}
