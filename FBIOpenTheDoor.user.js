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

  const CLASS_BannerDOM = "FO-banner";  // 成分条class
  const CLASS_StatDOM = "FO-stat";  // 成分条里每个成分的class
  const CLASS_Gateway = "FO-gateway";  // 入口的class
  const CLASS_UPiine = "reply-tags";  // "up主觉得很赞"的class
  const A_Uid = "data-usercard-mid";  // 用户Uid属性
  const A_User = "FO-user"  // 已经标注查成分的用户
  const QS_MainCommentUserHeader = "div.con > div.user";  // 评论的用户行DOM
  const QS_ReplyUserHeader = "div.reply-con > div.user";  // 楼中楼用户行DOM
  const QS_Uid = "a.name";  // 用户名DOM
  const QS_NewUser = `div.reply-wrap:not([${A_User}])`;  // 新刷出来的用户DOM
  const QS_ToolbarDOM = `div.info`;  // 评论下赞、踩、回复工具栏DOM

  const CSSSheet = `
span.${CLASS_StatDOM} {
  text-align: center;
  align-self: center;
  border: 2px solid white;
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

span.${CLASS_BannerDOM} {
  display: flex;
  border-radius: 10px;
  overflow:hidden;
  z-index: 128;
}

span.${CLASS_BannerDOM} a {
  color: black;
  padding-bottom: 0px;
  font-weight: 300;
}

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
}
`

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
  }
  class bilibiliUser {
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
      this.bannerDOM = document.createElement("span");
      this.statDOMs = [];
      this.offset = null;

      this.gatewayDOM = this.createGateway();
      this.userHeaderDOM.appendChild(this.bannerDOM);
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
    renderBanner() {
      //// 渲染成分条

      // 统计并修饰入口链接
      let no = -1, total = 0;
      for (let i in this.forwardCounter) {
        total += this.forwardCounter[i].count;
      }
      this.gatewayDOM.text = `(已查询到${total}条) `;
      if (this.has_more) {
        this.gatewayDOM.text += "继续查！";
      } else {
        this.gatewayDOM.onclick = null;
      }
      this.bannerDOM.innerHTML = "";
      this.statDOMs = [];
      for (let key in this.forwardCounter) {
        no = no + 1 < pallete.length ? no + 1 : 0;

        // 构建成分条中的一个成分，转发的同一up数量越多，该成分越长
        let statDOM = document.createElement("span");
        statDOM.classList.add(CLASS_StatDOM);
        statDOM.style.backgroundColor = pallete[no];
        statDOM.style.width = `${Math.floor(this.forwardCounter[key].count / total * 100)}%`;  // 宽度与数量成比例
        statDOM.innerHTML = `<a target="_blank" href='//space.bilibili.com/${key}'>${this.forwardCounter[key].name}</a>(${this.forwardCounter[key].count}, ${statDOM.style.width})`;
        statDOM.onmouseover = () => {
          if (this.statDOMs.length > 1)
            statDOM.style.width = `max(calc(${Math.floor(this.forwardCounter[key].count / total * 100)}%), calc(${statDOM.innerText.length + 2}em))`;  // 显示所有的字，为数字和半角括号增加冗余空间
        }
        statDOM.onmouseleave = () => {
          statDOM.style.width = `${Math.floor(this.forwardCounter[key].count / total * 100)}%`;  // 宽度与数量成比例
        }

        statDOM._FO_count = this.forwardCounter[key].count;  // 排序用

        this.statDOMs.push(statDOM);
      }
      this.statDOMs.sort((a, b) => {
        return b._FO_count - a._FO_count;
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
                    "count": 1
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
  }

  // main
  let users = [];
  let customCSSDOM = document.createElement("style");
  customCSSDOM.innerHTML = CSSSheet;
  document.body.appendChild(customCSSDOM);
  setInterval(() => {
    let newUsersDOM = document.querySelectorAll(QS_NewUser);
    for (let i = 0; i < newUsersDOM.length; i++) {
      users.push(new bilibiliUser(newUsersDOM[i]));
    }
  }, 5000);
  console.log(`开门！查成分！`);
})();
