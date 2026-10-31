"""Image integrity/geometry tests. Artificial pixels stay in memory, never production."""
import hashlib
import importlib.util
import io
import unittest
from pathlib import Path
from PIL import Image
spec = importlib.util.spec_from_file_location('worker', Path(__file__).parents[1] / 'scripts/nr/image-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class ImageWorkerTest(unittest.TestCase):
    def make(self, size, fmt='PNG', mode='RGB', orientation=None):
        image = Image.new(mode, size, (44, 77, 90, 0) if mode == 'RGBA' else (44, 77, 90))
        output = io.BytesIO()
        kwargs = {}
        if orientation:
            exif = image.getexif(); exif[274] = orientation; kwargs['exif'] = exif
        image.save(output, format=fmt, **kwargs)
        return output.getvalue()

    def test_proportions_small_panorama_and_transparency(self):
        for size, mode in [((1600, 900), 'RGB'), ((900, 1600), 'RGB'), ((3000, 200), 'RGB'), ((80, 40), 'RGBA')]:
            original = self.make(size, mode=mode)
            before = hashlib.sha256(original).hexdigest()
            data, result = worker.representation(original, before, 'image/png', 384)
            self.assertEqual(hashlib.sha256(original).hexdigest(), before)
            self.assertLessEqual(max(result['largura'], result['altura']), min(384, max(size)))
            self.assertLessEqual(abs(result['altura'] - result['largura'] * size[1] / size[0]), 1)
            self.assertEqual(result['sha256'], hashlib.sha256(data).hexdigest())
            with Image.open(io.BytesIO(data)) as decoded:
                decoded.load(); self.assertEqual(decoded.format, 'WEBP')
                if mode == 'RGBA': self.assertEqual(decoded.getpixel((1, 1))[3], 0)

    def test_exif_orientation_is_applied_only_to_representation(self):
        original = self.make((800, 400), 'JPEG', orientation=6)
        _, result = worker.representation(original, hashlib.sha256(original).hexdigest(), 'image/jpeg', 384)
        self.assertEqual((result['largura'], result['altura']), (192, 384))
        with Image.open(io.BytesIO(original)) as untouched:
            self.assertEqual(untouched.size, (800, 400)); self.assertEqual(untouched.getexif()[274], 6)

    def test_html_corruption_hash_and_mime_rejected(self):
        original = self.make((40, 80))
        for payload, digest, mime in [(b'<html>Login</html>', hashlib.sha256(b'<html>Login</html>').hexdigest(), 'image/png'),
                                      (original, 'a'*64, 'image/png'),
                                      (original, hashlib.sha256(original).hexdigest(), 'image/jpeg'),
                                      (original[:30], hashlib.sha256(original[:30]).hexdigest(), 'image/png')]:
            with self.assertRaises(Exception): worker.representation(payload, digest, mime, 384)

if __name__ == '__main__': unittest.main()
