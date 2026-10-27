# Phạm vi và quyết định kỹ thuật

Nguồn yêu cầu: [đoạn chat Gemini](https://gemini.google.com/share/2bb085c57031), đọc ngày 19/10/2026.

## Mục tiêu đã rút ra

Tự tạo video marketing bất động sản, chạy máy cá nhân, nhận input qua agent/skill, không cần làm app/web. Mong muốn 100 video/tháng, dài 1–2 phút, có chuyển động bản đồ, thông số, mô hình nhà, tư liệu 360, caption và tiếng Việt; xuất ngang/dọc, có thể chạy hai video đồng thời.

## Nền tảng đã triển khai

JSON → Zod validation → timeline/narration/SRT → Remotion bundle → Chromium + Three.js → H.264 MP4. Nội dung và animation xác định theo số frame, không dùng đồng hồ thật hay tích lũy `useFrame`, để render song song vẫn nhất quán.

Chỉ CLI và worker pool giới hạn hai tác vụ, chưa thêm server/database/Redis vì không cần cho phiên bản chạy theo lệnh. Mỗi job có output và trạng thái riêng. Remotion Studio chỉ là công cụ xem timeline có sẵn, không phải giao diện sản phẩm được xây thêm.

Đã chọn Remotion theo hướng trao đổi trong nguồn. Không chuyển sang HyperFrames cho phiên bản này. Tách adapter TTS khỏi render: không có key vẫn chạy; key chỉ nằm ở Node.js và không đưa vào props/bundle. TTS có thể tính phí chỉ khi gọi lệnh tương ứng.

## Những kết luận không nên kế thừa nguyên văn

1. **Một video không mặc nhiên bằng một request bản đồ.** API/SKU, session, tải tiles, browser tabs, render lại và cache ảnh hưởng usage; không thể suy ra chi phí từ số video đơn thuần. Bản khởi đầu không gọi API Maps và không cam kết tổng phí khi tích hợp sau này.
2. **Google Map Tiles không phải nguồn mặc định cho video bán nhà 1–2 phút.** Chính sách video được công bố giới hạn promotional video tối đa 30 giây, giới thiệu khả năng ứng dụng, không có Street View, kèm attribution và nhãn quy định. Mục tiêu đang xây khác với trường hợp đó; cần thỏa thuận phù hợp hoặc nguồn dữ liệu/tư liệu khác cho sản phẩm thực tế. [Nguồn Google](https://developers.google.com/maps/documentation/tile/policies).
3. **Gemini 3.8 TTS có trong tài liệu hiện hành đã tra cứu**, nhưng phải dùng đúng ID và schema; không lấy giá/tokens trong chat làm báo giá. Adapter hỗ trợ `gemini-3.8-flash-tts`/dòng 3.8 TTS, WAV hoàn chỉnh, metadata cho phong cách đọc. [REST TTS](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation), [pricing](https://ai.google.dev/gemini-api/docs/pricing).
4. **TTS khác STT.** Video này cần text-to-speech; speech-to-text chỉ cần nếu muốn nhận dạng lời trong video hoặc căn phụ đề theo lời nói.
5. **Ảnh thường không đủ để tái dựng chính xác góc khuất/360.** Chỉ nhận panorama đã chụp/ghép đúng; mô hình khối nhà là minh họa, không phải khảo sát hiện trạng. Không suy ra ranh pháp lý từ một điểm GPS.
6. **Chạy local không đồng nghĩa tất cả miễn phí.** Máy vẫn tiêu thụ tài nguyên; phí API và giấy phép phần mềm/dữ liệu tách biệt. Xem [giấy phép Remotion](https://www.remotion.dev/docs/license) khi dùng thương mại/mở rộng nhóm. Không có thông số đo thực tế cho 100 video 2 phút/tháng ở giai đoạn setup.

## Thứ tự mở rộng đề xuất

1. Lấy bộ tư liệu bất động sản thực đầu tiên: ảnh, clip, panorama, ranh đất và tiện ích đã xác minh. Tinh chỉnh bố cục/template bằng dữ liệu đó.
2. Chọn nguồn bản đồ có quyền xuất video phù hợp; thêm adapter địa lý và attribution, rồi mới camera bay bám GPS. Cảnh sơ đồ hiện tại không thể hiện địa lý thật.
3. Thay khối nhà bằng GLB có nguồn rõ ràng; bổ sung footprint và hướng nhà thay vì dựa vào GPS đơn lẻ.
4. Gọi model viết nội dung từ dữ kiện đã xác nhận; thêm timestamps STT/forced alignment nếu cần karaoke captions.
5. Nếu điều khiển từ xa: API localhost có xác thực + job queue lưu bền; cân nhắc tunnel khi thực sự cần. Chưa mở cổng hay thiết lập cloud.

## Tiêu chí kiểm chứng

`npm.cmd run check` kiểm tra TypeScript, input sai, path traversal, timeline không hở/chồng, concurrency và WAV. Kiểm tra thực bằng MP4 cả ngang/dọc, kích thước, thời lượng và ảnh của từng cảnh. TTS thật và tư liệu của khách cần kiểm chứng riêng sau khi có đầu vào.
