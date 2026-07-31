<template>
  <main class="responsive-viewport-harness">
    <header>
      <div>
        <strong>2560 × 900 CSS 视口</strong>
        <span>同源 iframe 真实媒体查询验收</span>
      </div>
      <code>scale: 70%</code>
    </header>
    <div class="responsive-viewport-stage">
      <iframe
        title="Element UI 2560px 响应式表单"
        src="/?layout=responsive-form&framed=1"
      />
    </div>
  </main>
</template>

<script>
export default {
  name: 'ResponsiveViewportHarness',
};
</script>

<style>
.responsive-viewport-harness {
  width: 100vw;
  min-width: 1180px;
  min-height: 100vh;
  padding: 16px;
  overflow: hidden;
  background: #DDE1E7;
}

.responsive-viewport-harness > header {
  display: flex;
  height: 48px;
  padding: 0 16px;
  align-items: center;
  justify-content: space-between;
  background: #FFFFFF;
  border-radius: 4px;
}

.responsive-viewport-harness > header strong,
.responsive-viewport-harness > header span {
  display: block;
}

.responsive-viewport-harness > header span {
  margin-top: 2px;
  color: #666666;
  font-size: 12px;
}

.responsive-viewport-harness > header code {
  color: #FF6014;
}

.responsive-viewport-stage {
  width: 1792px;
  height: 630px;
  margin: 16px auto 0;
  overflow: hidden;
  background: #EEF1F5;
  box-shadow: 0 4px 16px rgba(34, 34, 34, 0.12);
}

.responsive-viewport-stage iframe {
  display: block;
  width: 2560px;
  height: 900px;
  border: 0;
  transform: scale(0.7);
  transform-origin: top left;
}
</style>
