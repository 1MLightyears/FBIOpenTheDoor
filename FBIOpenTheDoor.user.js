// ==UserScript==
// @name        FBI Open the door! B站评论区用户转发动态统计
// @namespace   lightyears.im
// @version     1.0
// @description 统计B站评论区内用户转发动态的情况，按照原动态UP主分类。
// @author      1MLightyears
// @match       *://www.bilibili.com/video/*
// @match       *://www.bilibili.com/read/*
// @match       *://t.bilibili.com/*
// @match       *://space.bilibili.com/*
// @icon        https://static.hdslb.com/images/favicon.ico
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @connect     api.bilibili.com
// @license     Apache Licence 2.0
// @run-at      document-end
// ==/UserScript==

/*
本脚本的创意来自于 原神玩家指示器(https://greasyfork.org/zh-CN/scripts/450720-%E5%8E%9F%E7%A5%9E%E7%8E%A9%E5%AE%B6%E6%8C%87%E7%A4%BA%E5%99%A8)
感谢 laupuz_xu(https://greasyfork.org/zh-CN/users/954434-laupuz-xu)!
GitHub: https://github.com/1MLightyears/FBIOpenTheDoor
*/


(function () {
  "use strict";

  window.localStorage.setItem("FBIOpenTheDoor", "");  // DEBUG
  const bilibiliVersion = document.body.classList.contains("harmony-font");
  const CLASS_BannerDOM = "FO-banner";  // 成分条class
  const CLASS_StatDOM = "FO-stat";  // 成分条里每个成分的class
  const CLASS_Gateway = "FO-gateway";  // 入口的class
  const CLASS_ColleDOM = "FO-colle";  // 自定义集的class
  const CLASS_SubDOM = "FO-sub-stat";  // 自定义集中组分的class
  const CLASS_UPiine = "reply-tags";  // "up主觉得很赞"的class
  const A_User = "FO-user"  // 已经标注查成分的用户
  const QS_BannerInsertBefore_new = "div.root-reply, div.sub-reply-info";
  const localStorageKey = "FBIOpenTheDoor";

  // 在customCollections中的自定义集的数据结构:
  // {
  //    "cid": <uuid>
  //    "name": <str>
  //    "contains": [<list of uid>]
  // }
  var customCollections = JSON.parse(window.localStorage.getItem(localStorageKey) || '{"collections":{}}').collections;

  let A_Uid, QS_MainCommentUserHeader, QS_ReplyUserHeader, QS_Uid, QS_NewUser, QS_ToolbarDOM;
  if (bilibiliVersion) {
    // 新版
    QS_MainCommentUserHeader = "div.root-reply-container div.user-info";  // 评论的用户行DOM
    QS_ReplyUserHeader = "div.sub-reply-item > div.sub-user-info";  // 楼中楼用户行DOM
    QS_Uid = "div[data-user-id]";  // 用户名DOM
    QS_NewUser = `div.reply-item:not([${A_User}]), div.sub-reply-item:not([${A_User}])`;  // 新刷出来的用户DOM
    QS_ToolbarDOM = `div.reply-info, div.sub-reply-info`;  // 评论下赞、踩、回复工具栏DOM
    A_Uid = "data-user-id";  // 用户Uid属性
  } else {
    // 旧版
    QS_MainCommentUserHeader = "div.con > div.user";  // 评论的用户行DOM
    QS_ReplyUserHeader = "div.reply-con > div.user";  // 楼中楼用户行DOM
    QS_Uid = "a.name";  // 用户名DOM
    QS_NewUser = `div.reply-wrap:not([${A_User}])`;  // 新刷出来的用户DOM
    QS_ToolbarDOM = `div.info`;  // 评论下赞、踩、回复工具栏DOM
    A_Uid = "data-usercard-mid";  // 用户Uid属性
  }


  let CSSSheet = `
span.${CLASS_StatDOM} {
  text-align: center;
  align-self: center;
  margin: 2px;
  height: calc(2em);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: pre;
}

span.${CLASS_StatDOM}:hover {
  z-index: 256;
}

span.${CLASS_StatDOM}:hover a{
  text-decoration: underline;
}

div.${CLASS_BannerDOM} {
  display: flex;
  overflow:hidden;
  z-index: 128;
  padding: 3px;
}

div.${CLASS_BannerDOM} a {
  color: black;
  padding-bottom: 0px;
  font-weight: 300;
}
`;
  // 为不同版本适配不同的CSS样式
  if (bilibiliVersion) {
    // 新版
    CSSSheet += `
a.${CLASS_Gateway} {
  display: none;
  color: grey;
  position: inherit;
  z-index: 128;
  font-weight: 700;
  margin-left: 2em;
}

div.root-reply-container:hover a.${CLASS_Gateway},
div.sub-reply-item:hover a.${CLASS_Gateway} {
  display: inline;
}

/* 干掉挡事的认证粉丝牌 */
.reply-decorate:hover {
  display: none;
}
`;
  } else {
    // 旧版
    CSSSheet += `
a.${CLASS_Gateway} {
  display: none;
  color: grey;
  position: inherit;
  z-index: 128;
  font-weight: 700;
}

div.con:hover>:not(.reply-box) a.${CLASS_Gateway},
div.con div.reply-item:hover a.${CLASS_Gateway} {
  display: inline;
}

/* 干掉挡事的认证粉丝牌 */
.sailing:hover {
  display: none;
}`;
  }

  // 颜色盘
  const pallete = [
    "Pink",
    "LightSkyBlue",
    "Aqua",
    "SpringGreen",
    "DarkSeaGreen",
    "Beige",
    "Gold",
    "Wheat",
    "Tan",
    "DarkSalmon",
    "Tomato",
    "Silver",
  ]

  // 评论类型
  const TComment = {
    MainComment: 0,  // 评论区评论
    ReplyComment: 1,  // 评论区回复楼中楼评论
  };

  // 初始化成分条反查自定义集cid
  let collectionOfStat = {};
  for (let c in customCollections) {
    for (let i = 0, l = customCollections[c].contains.length; i < l; i++) {
      collectionOfStat[customCollections[c].contains[i]] = c;
    }
  }

  // dataTransfer不能存取对象?
  let _dragDOM = null;

  function genUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function saveCollection() {
    //// 保存自定义集设定至localStorage
    // TODO
  }
  function createCollection() {
    //// 新建一个自定义集并记录
    // TODO
  }

  function add2Collection(collection, stat) {
    ///// 将一个成分编入一个自定义集
    // TODO
  }

  class TDispDOM extends HTMLSpanElement {
    //// banner中的显示条类
    constructor(id, name, count, stat_type, parent_banner) {
      super();
      this._id = id || genUuid();
      this._name = name || "新集合";
      this._count = count || 0;
      this._stat_type = stat_type || TDispDOM.DispType.Statistic;
      this._contains = [];
      this._parent_banner = parent_banner;
      this.render();
    }
    setName(new_name) {
      this._name = new_name.toString();
      if (this.children.length && this.childNodes[0].nodeType === 3) {
        // 仅修改文本
        this.childNodes[0].nodeValue = this._name;
      } else {
        this.innerHTML = this._name + this.innerHTML;
      }
    }
    getName() {
      if (this.children.length && this.childNodes[0].nodeType === 3) {
        return this.childNodes[0].nodeValue;
      } else {
        return this.innerText;
      }
    }
    appendChild(DispDOM) {
      if (!DispDOM instanceof TDispDOM) {
        super.appendChild(DispDOM);
        console.warn(`FO DOM < ${this._name} >(${this._id})被侵入`);
      } else {
        let subDOM = document.createElement("span");
        subDOM._id = DispDOM._id;
        subDOM._name = DispDOM._name;
        subDOM._count = DispDOM._count;
        let percent = subDOM._count / this.total * 100;

        subDOM.classList.add(CLASS_SubDOM);

        let innerDetailDOM = document.createElement("a");
        innerDetailDOM.setAttribute("target", "_blank");
        innerDetailDOM.setAttribute("href", `//space.bilibili.com/${subDOM.stat_data.uid}`);
        innerDetailDOM.innerText = subDOM.stat_data.name;
        subDOM.appendChild(innerDetailDOM);
        subDOM.innerHTML += `(${subDOM.stat_data.count}, ${Math.floor(percent)}%)`;

        super.appendChild(subDOM);
      }
    }
    render(percent) {
      //// 渲染

      // common
      this.style.width = `${percent}%`;  // 宽度与数量成比例
      this.onmouseover = () => {
        if (percent < 99)
          this.style.width = `max(calc(${percent}%), calc(${this.getName().length + 2}em))`;  // 显示所有的字，为数字和半角括号增加冗余空间
      };
      this.onmouseleave = () => {
        this.style.width = `${percent}%`;
      };
      this.ondragover = (e) => {
        e.preventDefault();
      }
      this.ondragenter = (e) => {
        console.log(`进`, e.target);
        this.style.boxShadow = "0px 0px 0.5em grey";
      };
      this.ondragleave = (e) => {
        console.log(`出`, e.target);
        this.style.boxShadow = "";
      };

      // 修饰每个成分,根据类型
      switch (this._stat_type) {
        case TDispDOM.DispType.Statistic:
          // 成分条
          this.classList.add(CLASS_StatDOM);
          this.setAttribute("draggable", "true");

          // up主链接
          let innerDetailDOM = document.createElement("a");
          innerDetailDOM.setAttribute("target", "_blank");
          innerDetailDOM.setAttribute("href", `//space.bilibili.com/${this._id}`);
          innerDetailDOM.innerText = this._name;
          super.appendChild(innerDetailDOM);
          this.innerHTML += `(${this._count}, ${Math.floor(percent)}%)`;

          this.ondragstart = (e) => {
            console.log("起", e.target);
            _dragDOM = this;
          }
          this.ondrop = (e) => {
            this.ondragleave(e);
            console.log("落", e);  // DEBUG
            let sourceDOM = _dragDOM;
            while (!sourceDOM instanceof TDispDOM) sourceDOM = sourceDOM.parentNode;
            let targetCollection = createCollection();
            this.add2Collection(targetCollection, this._id);
            this.add2Collection(targetCollection, sourceDOM._id);
            if (this._parent_banner) {
              this._parent_banner.render();
            }
          };
          innerDetailDOM.ondragend = (e) => this.ondragend(e);
          innerDetailDOM.ondragenter = (e) => this.ondragenter(e);
          innerDetailDOM.ondragleave = (e) => this.ondragleave(e);
          break;
        case TDispDOM.DispType.Collection:
          // 渲染自定义集
          this.classList.add(CLASS_ColleDOM);
          this.setName(`${this._name}(${this._count}, ${Math.floor(percent)}%)`);
          // TODO 渲染子成分,绑定拖动终点事件
          break;
      }

    }
  }
  TDispDOM.DispType = {
    Collection: 0,
    Statistic: 1,
  };

  class TBilibiliUser {
    //// 评论用户类
    constructor(commentDOM) {
      //// 初始化用户类

      this.commentDOM = commentDOM;
      this.toolbarDOM = this.locateToolbar();
      this.userHeaderDOM = this.locateUserHeader();
      let userADOM = this.userHeaderDOM.querySelector(QS_Uid);
      this.uid = userADOM.getAttribute(A_Uid);
      this.name = userADOM.text;
      this.forwardCounter = {};
      this.bannerDOM = document.createElement("div");
      this.statDOMs = [];
      this.collectionDOMs = {};
      this.offset = null;
      this.total = 0;

      this.gatewayDOM = this.createGateway();
      if (bilibiliVersion) {
        // 新版
        let parentDOM = this.userHeaderDOM.parentNode;
        parentDOM.insertBefore(this.bannerDOM, parentDOM.querySelector(QS_BannerInsertBefore_new));
      } else {
        // 旧版
        this.userHeaderDOM.appendChild(this.bannerDOM);
      }
      this.commentDOM.setAttribute(A_User, true);
    }
    locateToolbar() {
      //// 定位评论工具栏
      let toolbarDOM = this.commentDOM.querySelector(QS_ToolbarDOM);
      return toolbarDOM;
    }
    locateUserHeader() {
      //// 定位用户行，确定评论类型
      let userHeaderDOM = this.commentDOM.querySelector(QS_MainCommentUserHeader);
      this.commentType = TComment.MainComment
      if (!userHeaderDOM) {
        userHeaderDOM = this.commentDOM.querySelector(QS_ReplyUserHeader);
        this.commentType = TComment.ReplyComment;
      }
      return userHeaderDOM;
    }
    createGateway() {
      //// 修饰查成分入口
      let gatewayDOM = document.createElement("a");
      gatewayDOM.classList.add(CLASS_Gateway);
      gatewayDOM.innerHTML = "开门！查成分！";
      gatewayDOM.onclick = this.getForwards.bind(this);

      // "up主觉得很赞"是div block,移动顺序
      let upiineDOM = null;
      if (!!this.toolbarDOM.lastChild && this.toolbarDOM.lastChild.classList.contains(CLASS_UPiine)) {
        upiineDOM = this.toolbarDOM.lastChild;
        this.toolbarDOM.removeChild(upiineDOM);
      }
      this.toolbarDOM.appendChild(gatewayDOM);
      if (!!upiineDOM) {
        this.toolbarDOM.appendChild(upiineDOM);
      }

      return gatewayDOM;
    }
    render() {
      //// 渲染成分条

      // 统计并修饰入口链接
      this.total = 0;
      for (let i in this.forwardCounter) {
        this.total += this.forwardCounter[i].count;
      }
      this.gatewayDOM.text = `(已查询到${this.total}条) `;
      if (this.has_more) {
        this.gatewayDOM.text += "继续查！";
      } else {
        this.gatewayDOM.onclick = null;
      }
      this.bannerDOM.innerHTML = "";

      // 构建内部成分表 先渲染所有的成分条
      this.statDOMs = [];
      for (let key in this.forwardCounter) {
        let curr = this.forwardCounter[key];
        this.statDOMs.push(new TDispDOM(
          curr.uid || curr.cid,
          curr.name,
          curr.count,
          curr.stat_type,
          this
        ));
      }

      // 显示statDOMs，刷新banner 数量较大的成分优先
      this.statDOMs.sort((a, b) => {
        return b.stat_data.count - a.stat_data.count;
      });
      let colorNo = -1;
      for (let i = 0; i < this.statDOMs.length; i++) {
        colorNo = colorNo + 1 < pallete.length ? colorNo + 1 : 0;
        this.bannerDOM.appendChild(this.statDOMs[i]);
        this.statDOMs[i].style.backgroundColor = pallete[colorNo];
      }
      this.bannerDOM.className = CLASS_BannerDOM;
    }
    fetchHomepage() {
      //// 拿B站API url
      return `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?&host_mid=${this.uid}`
        + (!!this.offset ? `&offset=${this.offset}` : "");
    }
    getForwards() {
      //// XHR拿动态列表
      this.gatewayDOM.text = "/// 警方突击中 ///";
      GM_xmlhttpRequest({
        method: "get",
        url: this.fetchHomepage(),
        data: "",
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36'
        },
        onload: function (resp) {
          if (resp.status === 200) {
            resp = JSON.parse(resp.response);
            for (let i = 0; i < resp.data.items.length; i++) {
              let item = resp.data.items[i];
              if (item.hasOwnProperty("orig")) {
                let originalUpUid = item.orig.modules.module_author.mid;
                if (!originalUpUid) continue;
                if (this.forwardCounter.hasOwnProperty(originalUpUid)) {
                  this.forwardCounter[originalUpUid].count += 1;
                } else {
                  this.forwardCounter[originalUpUid] = {
                    "name": item.orig.modules.module_author.name,
                    "uid": item.orig.modules.module_author.mid,
                    "count": 1,
                    "stat_type": TDispDOM.DispType.Statistic
                  }
                }
              }
            }
            this.offset = resp.data.offset;
            this.has_more = resp.data.has_more;
            this.collect();
            this.render();
          } else {
            console.warn(`获取失败@uid=${this.uid}: status=${resp.status}`);
          }
        }.bind(this)
      })
    }
    collect() {
      //// 根据自定义集分组情况，修改统计结果forwardCounter
      for (let key in this.forwardCounter) {
        let curr = this.forwardCounter[key];
        if (curr.stat_type === TDispDOM.DispType.Statistic &&
          collectionOfStat.hasOwnProperty(curr.uid)) {
          let cid = collectionOfStat[curr.uid];
          let targetCollection = this.forwardCounter[cid] || {
            "name": customCollections[cid].name,
            "cid": cid,
            "count": 0,
            "contains": [],
            "stat_type": TDispDOM.DispType.Collection
          }
          targetCollection.contains.push(curr);
          targetCollection.count += curr.count;
          delete this.forwardCounter[key];
        }
      }
    }
  }

  // main
  let users = [];
  let customCSSDOM = GM_addStyle(CSSSheet);
  setInterval(() => {
    let newUsersDOM = document.querySelectorAll(QS_NewUser);
    for (let i = 0; i < newUsersDOM.length; i++) {
      users.push(new TBilibiliUser(newUsersDOM[i]));
    }
  }, 5000);
  console.log(`%c开门！\n查成分！`, `font-size: 1.5em;font-style: italic;color:gold`);
})();
