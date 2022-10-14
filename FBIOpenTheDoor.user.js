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
  function genUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const bilibiliVersion = document.body.classList.contains("harmony-font");
  const CLASS_BannerDOM = "FO-banner";  // 成分条class
  const CLASS_StatDOM = "FO-stat";  // 成分条里每个成分的class
  const CLASS_Gateway = "FO-gateway";  // 入口的class
  const CLASS_UPiine = "reply-tags";  // "up主觉得很赞"的class
  const CLASS_CollectionDOM = "FO-colle";  // 用户定义集的class
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

  // 成分条类型
  const TStat = {
    Collection: 0,
    Statistic: 1,
  };

  // 初始化成分条反查自定义集cid
  let collectionOfStat = {};
  for (let c in customCollections) {
    for (let i = 0, l = customCollections[c].contains.length; i < l; i++) {
      collectionOfStat[customCollections[c].contains[i]] = c;
    }
  }

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

      for (let c in customCollections) {
        // 永远将所有的自定义集都创好DOM，但不一定加到DOM树上
        this.renderCollection(c);
      }
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
    createCollection() {
      //// 创建一个新的自定义集并记录
      let newCollection = {
        "cid": genUuid(),
        "name": `新集合`,
        "contains": []
      };
      customCollections[newCollection.cid] = newCollection;
      this.renderCollection(newCollection.cid);
      this.saveCollections();
      return newCollection;
    }
    saveCollections() {
      window.localStorage.setItem(localStorageKey, JSON.stringify({
        "collections": customCollections,
      }));
      for (let c in customCollections) {
        for (let i = 0, l = customCollections[c].contains.length; i < l; i++) {
          collectionOfStat[customCollections[c].contains[i]] = c;
        }
      }
    }
    addToCollection(statDOM) {
      //// 将一个成分条计入某个自定义集
      let uid = statDOM.stat_data.uid, cid = collectionOfStat[uid];
      customCollections[cid].contains.push(statDOM.stat_data.uid);
      this.renderBanner();
      // TODO: 异步刷当前页面上所有的banner
      return cid;
    }
    renderStat(key, colorNo) {
      //// 渲染一种成分
      let statDOM = document.createElement("span");
      statDOM.stat_data = this.forwardCounter[key];  // 排序用
      let percent = statDOM.stat_data.count / this.total * 100;
      this.statDOMs.push(statDOM);

      // 修饰每个成分
      statDOM.classList.add(CLASS_StatDOM);
      statDOM.style.backgroundColor = pallete[colorNo];
      statDOM.style.width = `${percent}%`;  // 宽度与数量成比例
      statDOM.setAttribute("draggable", "true");

      // up主链接
      let innerDetailDOM = document.createElement("a");
      innerDetailDOM.setAttribute("target", "_blank");
      innerDetailDOM.setAttribute("href", `//space.bilibili.com/${statDOM.stat_data.uid}`);
      innerDetailDOM.innerText = statDOM.stat_data.name;
      statDOM.appendChild(innerDetailDOM);
      statDOM.innerHTML += `(${statDOM.stat_data.count}, ${Math.floor(percent)}%)`;

      statDOM.onmouseover = () => {
        if (this.statDOMs.length > 1)
          statDOM.style.width = `max(calc(${percent}%), calc(${statDOM.innerText.length + 2}em))`;  // 显示所有的字，为数字和半角括号增加冗余空间
      };
      statDOM.onmouseleave = () => {
        statDOM.style.width = `${percent}%`;  // 宽度与数量成比例
      };
      statDOM.ondragenter = (e) => {
        console.log(`进`, e.target);
        statDOM.style.boxShadow = "0px 0px 0.5em grey";
      };
      statDOM.ondragover = (e) => {
        e.preventDefault();
      }
      statDOM.ondragleave = (e) => {
        console.log(`出`, e.target);
        statDOM.style.boxShadow = "";
      };
      statDOM.ondrop = (e) => {
        statDOM.ondragleave(e);
        console.log("落", e);  // DEBUG
        let originalStatDOM = e.target;
        while (!originalStatDOM instanceof HTMLSpanElement) originalStatDOM = originalStatDOM.parentNode;
        let targetCollection = this.createCollection();
        targetCollection.contains.push(statDOM.stat_data.uid);
        targetCollection.contains.push(originalStatDOM.stat_data.uid);
        this.saveCollections();
        this.renderBanner();
      };
      innerDetailDOM.ondragend = (e) => statDOM.ondragend(e);
      innerDetailDOM.ondragenter = (e) => statDOM.ondragenter(e);
      innerDetailDOM.ondragleave = (e) => statDOM.ondragleave(e);
    }
    renderCollection(cid) {
      //// 渲染一个用户自定义集
      let collectionDOM = document.createElement("span"), name = customCollections[cid].name;
      collectionDOM.stat_data = {
        "name": name,
        "cid": cid,
        "count": 0,
        "stat_type": TStat.Collection
      };
      this.collectionDOMs[cid] = collectionDOM;
      this.cSetCount(collectionDOM, 0);
    }
    renderBanner() {
      //// 渲染成分条

      // 统计并修饰入口链接
      let colorNo = -1;
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
        colorNo = colorNo + 1 < pallete.length ? colorNo + 1 : 0;
        this.renderStat(key, colorNo);
      }

      // 再检查每个成分条 若属于一个自定义集则将该条移至成分集下
      for (let i = 0, l = this.statDOMs.length; i < l; i++) {
        if (collectionOfStat.hasOwnProperty(this.statDOMs[i].stat_data.uid)) {
          let cid = collectionOfStat[this.statDOMs[i].stat_data.uid],
            collectionDOM = this.collectionDOMs[cid],
            statDOM = this.statDOMs[i];
          if (collectionDOM.childNodes.length < 2) {  // 有#text
            this.statDOMs.push(collectionDOM);
          }
          collectionDOM.appendChild(statDOM);
          this.cSetCount(collectionDOM, collectionDOM.stat_data.count + statDOM.stat_data.count);
        }
      }

      // 刷新banner 数量较大的成分优先
      this.statDOMs.sort((a, b) => {
        return b.stat_data.count - a.stat_data.count;
      });
      for (let i = 0; i < this.statDOMs.length; i++) {
        this.bannerDOM.appendChild(this.statDOMs[i]);
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
                    "stat_type": TStat.Statistic
                  }
                }
              }
            }
            this.offset = resp.data.offset;
            this.has_more = resp.data.has_more;
            this.renderBanner();
          } else {
            console.warn(`获取失败@uid=${this.uid}: status=${resp.status}`);
          }
        }.bind(this)
      })
    }
    // 自定义集相关操作(不单独定义类了)
    cSetCount(collectionDOM, count) {
      collectionDOM.stat_data.count = count;
      let percent = collectionDOM.stat_data.count / this.total * 100, name = collectionDOM.stat_data.name;

      collectionDOM.style.width = `${percent}%`;  // 宽度与数量成比例
      collectionDOM.innerHTML = `${name}(${collectionDOM.stat_data.count}, ${Math.floor(percent)}%)`;

      // 修饰DOM 因为涉及到count的变化所以重绑
      collectionDOM.classList.add(CLASS_CollectionDOM);
      collectionDOM.style.width = `${percent}%`;  // 宽度与数量成比例

      collectionDOM.innerHTML = `${name}(${collectionDOM.stat_data.count}, ${Math.floor(percent)}%)`;

      collectionDOM.onmouseover = (e) => {
        if (this.statDOMs.length > 1)
          collectionDOM.style.width = `max(calc(${percent}%), calc(${collectionDOM.innerText.length + 2}em))`;  // 显示所有的字，为数字和半角括号增加冗余空间
      };
      collectionDOM.onmouseleave = () => {
        collectionDOM.style.width = `${percent}%`;  // 宽度与数量成比例
      };
      collectionDOM.ondragenter = (e) => {
        console.log(`进`, e.target);
        collectionDOM.style.boxShadow = "0px 0px 0.5em grey";
      };
      collectionDOM.ondragover = (e) => {
        e.preventDefault();
      }
      collectionDOM.ondragleave = (e) => {
        console.log(`出`, e.target);
        collectionDOM.style.boxShadow = "";
      };
      collectionDOM.ondrop = (e) => {
        collectionDOM.ondragleave(e);
        console.log("落", e);  // DEBUG
        let originalStatDOM = e.target;
        while (!originalStatDOM instanceof HTMLSpanElement) originalStatDOM = originalStatDOM.parentNode;
        let targetCollection = this.createCollection();
        targetCollection.contains.push(originalStatDOM.stat_data.uid);
        this.saveCollections();
        this.renderBanner();
      };
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
