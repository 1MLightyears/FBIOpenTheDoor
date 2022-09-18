// ==UserScript==
// @name        FBI Open the door! B站评论区用户转发动态统计
// @namespace   lightyears.im
// @version     0.4
// @description 统计B站评论区内用户转发动态的情况，按照原动态UP主分类。
// @author      1MLightyears
// @match       *://www.bilibili.com/video/*
// @match       *://www.bilibili.com/read/*
// @match       *://t.bilibili.com/*
// @match       *://space.bilibili.com/*
// @icon        https://static.hdslb.com/images/favicon.ico
// @grant       GM_xmlhttpRequest
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
  const customCollections = JSON.parse(window.localStorage.getItem("FBIOpenTheDoor").collections || "{'collections':[]}");
  const CLASS_BannerDOM = "FO-banner";  // 成分条class
  const CLASS_StatDOM = "FO-stat";  // 成分条里每个成分的class
  const CLASS_Gateway = "FO-gateway";  // 入口的class
  const CLASS_UPiine = "reply-tags";  // "up主觉得很赞"的class
  const CLASS_CollectionStatDOM = "FO-colle-stat";  // 用户定义集的class
  const A_User = "FO-user"  // 已经标注查成分的用户
  const QS_BannerInsertBefore_new = "div.root-reply, div.sub-reply-info";
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
  border-radius: 10px;
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
    createCollection() {
      let newCollection = {
        "uid": genUuid(),
        "name": `新集合`,
        "components": []
      };
      this.collections[newCollection.uid] = newCollection;
      window.localStorage.setItem(this.collections);
      return newCollection;
    }
    renderStat(key, colorNo) {
      //// 渲染一种成分: 是一个用户自定义组，或是成分条
      let statDOM = document.createElement("span");
      statDOM.stat_data = this.forwardCounter[key];  // 排序用
      let percent = statDOM.stat_data.count / this.total * 100;
      this.statDOMs.push(statDOM);

      // 修饰每个成分
      statDOM.classList.add(CLASS_StatDOM);
      statDOM.style.backgroundColor = pallete[colorNo];
      statDOM.style.width = `${percent}%`;  // 宽度与数量成比例
      if (this.isCollection(key)) {

      } else {
        statDOM.setAttribute("draggable", "true");
      }

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
      statDOM.ondragenter = () => {
        statDOM.style.boxShadow = "0px 0px 1em grey";
      };
      statDOM.ondragleave = () => {
        statDOM.style.boxShadow = "";
      };
      statDOM.ondragend = (e) => {
        console.log(e);  // DEBUG
        let originalStatDOM = e.target;
        while (!originalStatDOM instanceof HTMLSpanElement) originalStatDOM = originalStatDOM.parentNode;
        let targetCollection = customCollection[statDOM.stat_data.uid] || this.createCollection();
        if (!statDOM.isCollection) {
          // 新建一个集合
          targetCollection.components.push(statDOM.stat_data.uid);
        }
        targetCollection.components.push(originalStatDOM.stat_data.uid);
        this.renderBanner();
      };
      innerDetailDOM.ondragend = statDOM.ondragend;
    }
    renderCollection(key, colorNo) {
      //// 渲染一个用户自定义集 // TODO
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

      // 构建内部成分表
      this.statDOMs = [];
      for (let key in this.forwardCounter) {
        colorNo = colorNo + 1 < pallete.length ? colorNo + 1 : 0;

        if (/* TODO 在localstorage里检查这个key是否在一个自定义集里 */) {
          this.renderCollection(key, colorNo);
        } else {
          this.renderStat(key, colorNo);
        }
      }
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
    isCollection(key) {
      return customCollections.contains(key);
    }
  }

  // main
  let users = [];
  let customCSSDOM = document.createElement("style");
  customCSSDOM.innerHTML = CSSSheet;
  document.body.appendChild(customCSSDOM);
  setInterval(() => {
    let newUsersDOM = document.querySelectorAll(QS_NewUser);
    for (let i = 0; i < newUsersDOM.length; i++) {
      users.push(new TBilibiliUser(newUsersDOM[i]));
    }
  }, 5000);
  console.log(`开门！查成分！`);
})();
