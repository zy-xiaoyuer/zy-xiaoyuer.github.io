
  export default {
    title: '小芋儿', //站点标题
    description: '一个vue3组件库',//mate标签description，多用于搜索引擎抓取摘要
    themeConfig: {
      siteTitle: "小芋儿",
      logo: "/logo.png",
    // 侧边栏
    nav: [
        { text: "Guide", link: "/guide/" },
        { text: "GuideTest", link: "/guide/test" },
        { text: "gitee", link: "https://gitee.com/geeksdidi" },
        {
          text: "Drop Menu",
          items: [
            { text: 'Item A', link: '/item-1' },
            { text: 'Item B', link: '/item-2' },
            { text: 'Item C', link: '/item-3' }
          ]
        }
      ],
    //   社交链接
      socialLinks: [
        { icon: "github", link: "https://gitee.com/geeksdidi" },
        { icon: "twitter", link: "..." },
        // You can also add custom icons by passing SVG as string:
        {
          icon: {
            svg: '<svg role="img" viewBox="0 0 24 24" xmlns="SVG namespace"><title>Dribbble</title><path d="M12...6.38z"/></svg>',
          },
          link: "...",
        },
      ],
    //   侧边栏
    sidebar: {
        // 只有包含articles路径的才具有侧边栏
        "/articles/": [
          {
            text: "组件库源码实现",
            items: [
              {
                text: "组件库环境搭建",
                link: "/articles/组件库环境搭建",
              },
              { text: "gulp的使用", link: "/articles/gulp的使用" },
            ],
          },
          {
            text: "vue教程",
            // 可折侧边栏
            collapsible: true,
          collapsed:true,
          items: [
            {
              text: "pina和vuex",
              link: "/articles/pina和vuex",
            },
          ],
          },
        ],
      },
    },
  };