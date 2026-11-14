# Модели для «Взгляда Nazar» и «Сканера рюкзака»

- `face_landmarker.task` — MediaPipe Face Landmarker (float16, версия 1), лицензия Apache 2.0,
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  (sha256 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff).
- `efficientdet_lite0.tflite` — MediaPipe Object Detector, EfficientDet-Lite0 (int8, версия 1, 80 классов COCO), лицензия Apache 2.0,
  https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
  (sha256 0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb).

Папку `wasm/` не храним в git: её копирует `scripts/vision-assets.mjs` из пакета `@mediapipe/tasks-vision`
перед `next dev` и `next build`.

Модели и среда выполнения отдаются самим Nazar, поэтому кадры с камеры обрабатываются в браузере
и никуда не уходят.
