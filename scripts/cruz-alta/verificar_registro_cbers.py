"""Mede novamente o registro óptico da folha local contra o derivado CBERS.

Exige OpenCV (opencv-python-headless), NumPy, PyMuPDF e Pillow. Entrada opcional
--foto aceita o recorte privado da folha em ponto PDF × 0,7. A entrada --pdf
reconstrói o recorte pela fotografia embutida, sem os rótulos vetoriais.
"""
import argparse
import io
import json
from pathlib import Path

import cv2
import numpy as np


def local_photo(path):
    import pymupdf
    from PIL import Image
    with pymupdf.open(path) as document:
        page = document[0]
        candidates = [(entry, rect) for entry in page.get_images()
                      for rect in page.get_image_rects(entry[0])
                      if entry[2:] and entry[2] == 4542 and entry[3] == 3306]
        if len(candidates) != 1:
            raise ValueError("A folha não corresponde à fotografia identificada nas revisões 43 e 56.")
        entry, rect = candidates[0]
        im = Image.open(io.BytesIO(document.extract_image(entry[0])["image"])).convert("RGB")
        x0, y0 = [int(v*.7) for v in (rect.x0,rect.y0)]
        x1, y1 = [round(v*.7) for v in (rect.x1,rect.y1)]
        canvas = Image.new("RGB",(1270,925),(223,223,215))
        canvas.paste(im.resize((x1-x0,y1-y0),Image.Resampling.BICUBIC),(x0,y0))
        return cv2.cvtColor(np.array(canvas),cv2.COLOR_RGB2BGR)


def gradients(image, blur):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    soft = cv2.GaussianBlur(gray,(0,0),blur)
    dx,dy = cv2.Sobel(soft,cv2.CV_32F,1,0), cv2.Sobel(soft,cv2.CV_32F,0,1)
    scale = np.sqrt(np.maximum(np.hypot(dx,dy),3.))
    return cv2.merge((dx/scale,dy/scale))


def measure(photo, base, controls, transform):
    manifest=json.loads((base/"manifest.json").read_text())["nearby"]
    orbit=cv2.imread(str(base/manifest["albedo"]))
    if photo is None or orbit is None:
        raise ValueError("Não foi possível decodificar uma das imagens.")
    height,width=orbit.shape[:2]
    west,north,east,south=manifest["bounds"]
    mx,mz=(east-west)/width,(south-north)/height
    matrix=np.array(transform,dtype=np.float64,copy=True)
    matrix[0]=(matrix[0]-[0,0,west])/mx
    matrix[1]=(matrix[1]-[0,0,north])/mz
    reference=cv2.warpAffine(photo,np.float32(matrix),(width,height),flags=cv2.INTER_AREA)
    g1,g2=gradients(reference,1.7),gradients(orbit,.8)
    delta=[]
    for p in controls["points"]:
        x,y=np.rint(matrix @ [*p["sheet"],1]).astype(int)
        w=p["halfWindowPixels"]; r=controls["searchRadiusPixels"]
        patch=g1[y-w:y+w,x-w:x+w]
        window=g2[y-w-r:y+w+r,x-w-r:x+w+r]
        score=cv2.matchTemplate(window,patch,cv2.TM_CCORR_NORMED)
        _,confidence,_,(i,j)=cv2.minMaxLoc(score)
        delta.append({"id":p["id"],"group":p["group"],"dXZMetres":[(i-r)*mx,(j-r)*mz],"score":round(confidence,3)})
    fit=np.array([p["dXZMetres"] for p in delta if p["group"]=="ajuste"])
    held=np.array([p["dXZMetres"] for p in delta if p["group"]=="independente"])
    offset=fit.mean(axis=0);errors=np.linalg.norm(held-offset,axis=1)
    return {"sampleShiftXZMetres":offset.tolist(),"independentRMSEMetres":float(np.sqrt(np.mean(errors**2))),
            "independentMaximumMetres":float(np.max(errors)),"points":delta}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--pdf",type=Path);source.add_argument("--foto",type=Path)
    root=Path(__file__).resolve().parents[2]
    parser.add_argument("--mosaico",type=Path,default=root/"public/models/cruz-alta/regional")
    args=parser.parse_args()
    c=json.loads((root/"docs/cruz-alta/registro-cbers.json").read_text())
    m=json.loads((root/"docs/cruz-alta/registro.json").read_text())["parameters"]
    image=local_photo(args.pdf) if args.pdf else cv2.imread(str(args.foto))
    print(json.dumps(measure(image,args.mosaico,c,m),ensure_ascii=False,indent=2))
