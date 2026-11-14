# Распознавание лица для «Взгляда Nazar»

`face_landmarker.task` — модель MediaPipe Face Landmarker (float16, версия 1), лицензия Apache 2.0,
скачана с https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
(sha256 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff).

Папку `wasm/` не храним в git: её копирует `scripts/gaze-assets.mjs` из пакета `@mediapipe/tasks-vision`
перед `next dev` и `next build`.

Модель и среда выполнения отдаются самим Nazar, поэтому кадры с камеры обрабатываются в браузере
и никуда не уходят.
